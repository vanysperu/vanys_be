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
  const variantProduct = `WebColor${wordStamp()}`;
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
    await queryRows("UPDATE reminder SET is_deleted = true WHERE message LIKE ? OR message LIKE ?", [
      `%${missingSku}%`,
      `%${variantProduct}%`,
    ]);
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
    expect(res.body.data.missing_items).toEqual([{ sku: missingSku, code: null, quantity: 30 }]);

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

  it("solo pasa a Pendiente una vez completada, y se puede seguir editando", async () => {
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

    const edited = await api.put(`/quotation/${quotationId}/items`, {
      items: [{ product_id: productId, technique_id: techniqueId, quantity: 1, pricing_mode: "unit" }],
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data.total).toBe(2.5);
  });

  it("identifica producto y color por el código, y el equipo conserva o corrige el color", async () => {
    const api = authedRequest(token);
    const colorSku = `${sku}-COL`;
    const singleCodeSku = `${sku}-UNO`;
    const blackCode = `NEG-${sku}`;
    const blueCode = `AZU-${sku}`;
    const singleCode = `UNO-${sku}`;
    const colors = [
      { name: "Negro", hex: "#111111" },
      { name: "Azul", hex: "#0000FF" },
    ];
    const created = await api.post("/product/create", {
      company_id: companyId,
      name: variantProduct,
      sku: colorSku,
      price_unit: 2,
      colors,
      codes: [
        { code: blackCode, color: "Negro" },
        { code: blueCode, color: "Azul" },
      ],
    });
    expect(created.status).toBe(201);
    await api.post("/product/create", {
      company_id: companyId,
      name: `${variantProduct}Uno`,
      sku: singleCodeSku,
      price_unit: 3,
      colors,
      codes: [{ code: singleCode }],
    });

    const res = await sendRequest({
      client: { phone },
      items: [
        // Solo el código: dice producto y color. Sin importar mayúsculas.
        { code: blackCode.toLowerCase(), quantity: 100 },
        { code: blackCode, quantity: 50 },
        { code: blueCode, quantity: 200 },
        // Un solo código para todos los colores: el color llega aparte.
        { code: singleCode, color: "azul", quantity: 10 },
        // Sin código: basta el SKU y el color.
        { sku: colorSku, color: "Azul", quantity: 5 },
        // Código de otro producto: se respeta el SKU, sin ese código.
        { sku: colorSku, code: singleCode, quantity: 7 },
        // El color del código manda sobre el color pedido.
        { code: blueCode, color: "Negro", quantity: 1 },
        // Color que el producto no tiene.
        { sku: singleCodeSku, color: "Rojo", quantity: 3 },
        // Código inexistente: no entra y se avisa.
        { code: `${missingSku}-C`, quantity: 9 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.missing_items).toEqual([{ sku: null, code: `${missingSku}-C`, quantity: 9 }]);
    expect(res.body.data.items_added.map((item: { sku: string; code: string; color: string; quantity: number }) => [item.sku, item.code, item.color, item.quantity])).toEqual([
      [colorSku, blackCode, "Negro", 150],
      [colorSku, blueCode, "Azul", 201],
      [singleCodeSku, singleCode, "Azul", 10],
      [colorSku, null, "Azul", 5],
      [colorSku, null, null, 7],
      [singleCodeSku, null, null, 3],
    ]);
    const warnings = res.body.data.warnings.join(" | ");
    expect(warnings).toContain(`el código ${singleCode} no corresponde`);
    expect(warnings).toContain(`el código ${blueCode} de "${variantProduct}" es Azul, no Negro`);
    expect(warnings).toContain("no tiene el color Rojo");

    const quotationId = res.body.data.quotation_id;
    const detail = (await api.get(`/quotation/find/${quotationId}`)).body.data;
    expect(detail.items[0]).toMatchObject({ product_code: blackCode, color: "Negro", quantity: 150 });
    // El detalle trae los colores del producto para el formulario de completar.
    expect(detail.items[0].product.colors).toEqual(colors);
    expect(detail.events.some((event: { description: string }) => event.description.includes("Revisar color:"))).toBe(true);

    const [reminder] = await queryRows<{ message: string }>(
      "SELECT message FROM reminder WHERE message LIKE ? ORDER BY id DESC LIMIT 1",
      [`%${missingSku}-C%`]
    );
    expect(reminder?.message).toContain(`código ${missingSku}-C × 9 u.`);
    expect(reminder?.message).toContain("Revisa el color al completar la cotización:");

    // Completar borra y recrea los items: el color y el código no se pierden.
    const blackItem = detail.items[0];
    const singleItem = detail.items[2];
    const base = { quantity: 10, pricing_mode: "unit" };
    const completed = await api.put(`/quotation/${quotationId}/items`, {
      items: [
        { ...base, product_id: blackItem.product_id, product_code: blackCode, color: "Negro" },
        // El equipo corrige el color: el código pasa a ser el de ese color.
        { ...base, product_id: blackItem.product_id, product_code: blackCode, color: "Azul" },
        // Un código sin color vinculado se conserva con el color elegido.
        { ...base, product_id: singleItem.product_id, product_code: singleCode, color: "Negro" },
        // Sin color elegido, el código aporta su color.
        { ...base, product_id: blackItem.product_id, product_code: blueCode },
      ],
    });
    expect(completed.status).toBe(200);
    const items = (await api.get(`/quotation/find/${quotationId}`)).body.data.items;
    expect(items.map((item: { product_code: string; color: string }) => [item.product_code, item.color])).toEqual([
      [blackCode, "Negro"],
      [blueCode, "Azul"],
      [singleCode, "Negro"],
      [blueCode, "Azul"],
    ]);

    const wrongColor = await api.put(`/quotation/${quotationId}/items`, {
      items: [{ ...base, product_id: blackItem.product_id, color: "Rojo" }],
    });
    expect(wrongColor.status).toBe(400);
    expect(wrongColor.body.code).toBe("QUOTATION_ITEM_COLOR_NOT_FOUND");
  });

  it("rechaza un item sin SKU ni código", async () => {
    const res = await sendRequest({ client: { phone }, items: [{ quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("una key revocada deja de funcionar", async () => {
    await queryRows("UPDATE api_key SET is_deleted = true WHERE id = ?", [apiKeyId]);
    const res = await sendRequest({ client: { phone }, items: [{ sku, quantity: 1 }] });
    expect(res.status).toBe(401);
  });
});
