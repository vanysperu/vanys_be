import { createHash, randomBytes } from "crypto";
import request from "supertest";
import { authedRequest, BASE_URL, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";

/**
 * Pedidos de cotización desde la web (pedido explícito del usuario): la web
 * manda SKU + cantidad + celular del cliente con una API key por empresa; la
 * cotización nace "Pendiente de cotizar", el equipo la completa y la pasa a
 * Pendiente. Un SKU inexistente no entra y genera un aviso para la empresa.
 */
describe("Pedidos de cotización desde la web (API key)", () => {
  let token: string;
  let companyId: number;
  let apiKeyId: number;
  let techniqueId: number;
  const plainKey = `vnk_${randomBytes(32).toString("base64url")}`;
  const sku = `WEB-${Date.now()}`;
  const missingSku = `NOEXISTE-${Date.now()}`;
  // Celular único por corrida: el cliente se identifica por él.
  const phone = `9${String(Date.now()).slice(-8)}`;

  const sendRequest = (body: object, key: string | null = plainKey) => {
    const req = request(BASE_URL).post("/api/public/quotation-request");
    return (key ? req.set("X-Api-Key", key) : req).send(body);
  };

  beforeAll(async () => {
    const session = await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password);
    token = session.token;
    const api = authedRequest(token);
    const me = (await api.get("/access/me")).body.data;
    companyId = me.companyId;

    await api.post("/product/create", {
      company_id: companyId,
      name: `WebProd${wordStamp()}`,
      sku,
      price_unit: 2,
      price_hundred: 1.5,
      requires_customization: true,
    });
    techniqueId = (
      await api.post("/customization-technique/create", {
        company_id: companyId,
        name: `WebTech${wordStamp()}`,
        price_unit: 0.5,
        price_hundred: 0.4,
      })
    ).body.data.id;

    // La key se emite igual que `npm run api-key -- create` (solo el hash
    // queda en la base). Atada a la tienda del admin QA (está ligado a una),
    // para que vea las cotizaciones que crea.
    await queryRows(
      `INSERT INTO api_key (company_id, business_unit_id, name, key_prefix, key_hash, is_deleted,
                            created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, 'jest web', ?, ?, false, ?, UTC_TIMESTAMP(), ?, UTC_TIMESTAMP())`,
      [companyId, me.businessUnitId ?? null, plainKey.slice(0, 12), createHash("sha256").update(plainKey).digest("hex"), session.userId, session.userId]
    );
    const [row] = await queryRows<{ id: number }>("SELECT id FROM api_key WHERE key_prefix = ? ORDER BY id DESC LIMIT 1", [
      plainKey.slice(0, 12),
    ]);
    apiKeyId = row!.id;
  });

  afterAll(async () => {
    await queryRows("UPDATE api_key SET is_deleted = true WHERE id = ?", [apiKeyId]);
    // Los avisos de prueba no deben aparecer como toasts en la suite E2E.
    await queryRows("UPDATE reminder SET is_deleted = true WHERE message LIKE ?", [`%${missingSku}%`]);
  });

  it("rechaza sin API key, con una key falsa y sin celular", async () => {
    const body = { client: { phone }, items: [{ sku, quantity: 1 }] };
    const missing = await sendRequest(body, null);
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe("INVALID_API_KEY");

    const fake = await sendRequest(body, "vnk_falsa");
    expect(fake.status).toBe(401);

    const noPhone = await sendRequest({ client: {}, items: [{ sku, quantity: 1 }] });
    expect(noPhone.status).toBe(400);
    expect(noPhone.body.code).toBe("VALIDATION_ERROR");
  });

  it("crea la cotización 'Pendiente de cotizar', el cliente por celular y avisa los SKU inexistentes", async () => {
    const res = await sendRequest({
      client: { phone: `+51 ${phone}`, name: "Cliente Web Jest" },
      items: [
        { sku: sku.toLowerCase(), quantity: 100 },
        { sku, quantity: 50 },
        { sku: missingSku, quantity: 30 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("quote_requested");
    expect(res.body.data.client_created).toBe(true);
    // Mismo SKU (sin distinguir mayúsculas) se suma en un item.
    expect(res.body.data.items_added).toHaveLength(1);
    expect(res.body.data.items_added[0].quantity).toBe(150);
    expect(res.body.data.missing_items).toEqual([{ sku: missingSku, quantity: 30 }]);

    const quotationId = res.body.data.quotation_id;
    const detail = (await authedRequest(token).get(`/quotation/find/${quotationId}`)).body.data;
    expect(detail.valid_until).toBeNull();
    // 150 unidades -> tarifa "ciento" sugerida, sin técnica.
    expect(detail.items[0].pricing_mode).toBe("hundred");
    expect(Number(detail.items[0].unit_price)).toBe(1.5);
    expect(detail.items[0].technique_id).toBeNull();

    const reminders = await queryRows<{ total: number }>(
      "SELECT COUNT(*) AS total FROM reminder WHERE company_id = ? AND message LIKE ?",
      [companyId, `%${missingSku} × 30%`]
    );
    expect(Number(reminders[0]!.total)).toBeGreaterThan(0);

    // Mismo celular (otro formato): reutiliza el cliente.
    const again = await sendRequest({ client: { phone }, items: [{ sku, quantity: 1 }] });
    expect(again.status).toBe(201);
    expect(again.body.data.client_created).toBe(false);
    expect(again.body.data.client_id).toBe(res.body.data.client_id);
  });

  it("solo pasa a Pendiente una vez completada, y después ya no se edita", async () => {
    const created = await sendRequest({ client: { phone }, items: [{ sku, quantity: 10 }] });
    const quotationId = created.body.data.quotation_id;
    const api = authedRequest(token);

    const incomplete = await api.put(`/quotation/status/${quotationId}`, { status: "pending" });
    expect(incomplete.status).toBe(409);
    expect(incomplete.body.code).toBe("QUOTATION_INCOMPLETE");

    const skip = await api.put(`/quotation/status/${quotationId}`, { status: "accepted" });
    expect(skip.status).toBe(400);

    const productId = (await api.get(`/quotation/find/${quotationId}`)).body.data.items[0].product_id;
    const completed = await api.put(`/quotation/${quotationId}/items`, {
      items: [{ product_id: productId, technique_id: techniqueId, quantity: 10, pricing_mode: "unit" }],
      includes_igv: false,
    });
    expect(completed.status).toBe(200);
    // (2 + 0.5) × 10
    expect(completed.body.data.total).toBe(25);

    const toPending = await api.put(`/quotation/status/${quotationId}`, { status: "pending" });
    expect(toPending.status).toBe(200);
    const detail = (await api.get(`/quotation/find/${quotationId}`)).body.data;
    expect(detail.status).toBe("pending");
    expect(detail.valid_until).not.toBeNull();

    const frozen = await api.put(`/quotation/${quotationId}/items`, {
      items: [{ product_id: productId, technique_id: techniqueId, quantity: 1, pricing_mode: "unit" }],
    });
    expect(frozen.status).toBe(409);
    expect(frozen.body.code).toBe("QUOTATION_NOT_EDITABLE");
  });

  it("una key revocada deja de funcionar", async () => {
    await queryRows("UPDATE api_key SET is_deleted = true WHERE id = ?", [apiKeyId]);
    const res = await sendRequest({ client: { phone }, items: [{ sku, quantity: 1 }] });
    expect(res.status).toBe(401);
  });
});
