import { createECDH, createHash, randomBytes } from "crypto";
import request from "supertest";
import { activateInvitedUser, authedRequest, BASE_URL, login, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const GESTOR_ROLE_ID = 6;

// Suscripción con claves reales (el cifrado del aviso las necesita) y una
// dirección de push que no responde: así se prueba A QUIÉN se le intenta
// avisar sin tocar los servicios reales de Apple/Google.
const fakeSubscription = (label: string) => ({
  endpoint: `https://127.0.0.1:9/push/${label}-${wordStamp()}`,
  keys: {
    p256dh: createECDH("prime256v1").generateKeys().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  },
});

interface SubscriptionRow {
  user_id: number;
  active: number;
  last_error: string | null;
}

/**
 * Notificaciones al teléfono (pedido del usuario, 14-nov-2026): cuando llega un
 * pedido "Pendiente de cotizar" desde la web, se avisa a quienes completan
 * cotizaciones en esa tienda y a los admins de la empresa. Empresa desechable.
 */
describe("Notificaciones al teléfono", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let other: CashClosingTestCompany;
  let storeBGestor: { token: string; userId: number };
  let apiKeyId: number;
  const plainKey = `vnk_${randomBytes(32).toString("base64url")}`;
  const sku = `PUSH-${Date.now()}`;
  const subscriptions = new Map<string, ReturnType<typeof fakeSubscription>>();

  const subscribe = (token: string, label: string) => {
    const subscription = fakeSubscription(label);
    subscriptions.set(label, subscription);
    return authedRequest(token).post("/push/subscribe", subscription);
  };
  const rowOf = async (label: string) =>
    (
      await queryRows<SubscriptionRow>("SELECT user_id, active, last_error FROM push_subscription WHERE endpoint_hash = ?", [
        createHash("sha256").update(subscriptions.get(label)!.endpoint).digest("hex"),
      ])
    )[0];

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    other = await createCashClosingTestCompany(superToken);

    // Un gestor de OTRA tienda de la misma empresa: no tiene que recibir el aviso.
    const storeB = await authedRequest(superToken).post("/business-unit/create", { company_id: ctx.companyId, business_code: `QP-${wordStamp().slice(0, 6)}` });
    const email = `push.gestor.${wordStamp()}@acme.test`;
    const created = await authedRequest(superToken).post("/user/create", {
      name: "Push",
      paternal_lastname: "TiendaB",
      document_type: 1,
      document_number: `${Date.now()}`.slice(-8),
      date_of_birth: "01/01/1990",
      email,
      status: true,
      gender: 4,
      company_id: ctx.companyId,
      business_unit_id: storeB.body.data.id,
      roleIds: GESTOR_ROLE_ID,
    });
    storeBGestor = await activateInvitedUser(created.body, email, "Test1234");

    await authedRequest(ctx.admin.token).post("/product/create", { company_id: ctx.companyId, name: `Push ${wordStamp()}`, sku, price_unit: 2 });
    await queryRows(
      `INSERT INTO api_key (company_id, business_unit_id, name, key_prefix, key_hash, is_deleted, created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, 'jest push', ?, ?, false, ?, UTC_TIMESTAMP(), ?, UTC_TIMESTAMP())`,
      [ctx.companyId, ctx.storeId, plainKey.slice(0, 12), createHash("sha256").update(plainKey).digest("hex"), ctx.admin.userId, ctx.admin.userId]
    );
    apiKeyId = (await queryRows<{ id: number }>("SELECT id FROM api_key WHERE key_prefix = ? ORDER BY id DESC LIMIT 1", [plainKey.slice(0, 12)]))[0]!.id;
  }, 120_000);

  afterAll(async () => {
    await queryRows("UPDATE api_key SET is_deleted = true WHERE id = ?", [apiKeyId]);
    for (const company of [ctx, other]) {
      if (company?.companyId) await authedRequest(superToken).put(`/company/disable/${company.companyId}`);
    }
  });

  it("el servidor informa la clave pública; una suscripción que no es https se rechaza", async () => {
    const status = await authedRequest(ctx.gestor.token).get("/push/status");
    expect(status.status).toBe(200);
    expect(status.body.data.enabled).toBe(true);
    expect(String(status.body.data.public_key).length).toBeGreaterThan(40);

    const insecure = await authedRequest(ctx.gestor.token).post("/push/subscribe", { ...fakeSubscription("x"), endpoint: "http://127.0.0.1:9/push/x" });
    expect(insecure.status).toBe(400);
  });

  it("cada usuario activa las notificaciones en su teléfono", async () => {
    for (const [token, label] of [
      [ctx.admin.token, "admin"],
      [ctx.gestor.token, "gestorA"],
      [ctx.storeAdmin.token, "storeAdminA"],
      [storeBGestor.token, "gestorB"],
      [other.admin.token, "otherAdmin"],
    ] as const) {
      expect((await subscribe(token, label)).status).toBe(200);
    }
    expect(await rowOf("gestorA")).toMatchObject({ user_id: ctx.gestor.userId, active: 1, last_error: null });
  });

  it("un pedido desde la web avisa a los de esa tienda y a los admins de la empresa; a nadie más", async () => {
    const res = await request(BASE_URL)
      .post("/api/public/quotation-request")
      .set("X-Api-Key", plainKey)
      .send({ client: { phone: `9${String(Date.now()).slice(-8)}`, name: "Cliente Push" }, items: [{ sku, quantity: 10 }] });
    expect(res.status).toBe(201);

    // El aviso sale después de guardar el pedido, sin frenarlo: se espera a que se intente.
    const expected = ["admin", "gestorA", "storeAdminA"];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const rows = await Promise.all(expected.map(rowOf));
      if (rows.every((row) => row?.last_error)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    for (const label of expected) expect((await rowOf(label))?.last_error).toBeTruthy();
    expect((await rowOf("gestorB"))?.last_error).toBeNull();
    expect((await rowOf("otherAdmin"))?.last_error).toBeNull();
  }, 30_000);

  it("la notificación de prueba va solo a los teléfonos del propio usuario", async () => {
    const test = await authedRequest(storeBGestor.token).post("/push/test");
    expect(test.status).toBe(200);
    expect(test.body.data).toMatchObject({ attempted: 1, sent: 0, failed: 1 });
    expect((await rowOf("gestorB"))?.last_error).toBeTruthy();
    expect((await rowOf("otherAdmin"))?.last_error).toBeNull();
  });

  it("desactivar apaga ese teléfono; sin teléfonos activos la prueba responde 404", async () => {
    const off = await authedRequest(other.admin.token).post("/push/unsubscribe", { endpoint: subscriptions.get("otherAdmin")!.endpoint });
    expect(off.status).toBe(200);
    expect((await rowOf("otherAdmin"))?.active).toBe(0);
    const test = await authedRequest(other.admin.token).post("/push/test");
    expect(test.status).toBe(404);
    expect(test.body.code).toBe("PUSH_NOT_SUBSCRIBED");
  });

  it("el mismo teléfono con otro usuario pasa a ser de ese usuario (solo avisa a quien lo usa)", async () => {
    const shared = subscriptions.get("gestorA")!;
    const res = await authedRequest(ctx.storeAdmin.token).post("/push/subscribe", shared);
    expect(res.status).toBe(200);
    const rows = await queryRows<{ user_id: number; total: number }>(
      "SELECT user_id, COUNT(*) AS total FROM push_subscription WHERE endpoint_hash = ? GROUP BY user_id",
      [createHash("sha256").update(shared.endpoint).digest("hex")]
    );
    expect(rows).toEqual([{ user_id: ctx.storeAdmin.userId, total: 1 }]);
    // Desactivar con el usuario anterior no toca la suscripción que ya no es suya.
    await authedRequest(ctx.gestor.token).post("/push/unsubscribe", { endpoint: shared.endpoint });
    expect((await rowOf("gestorA"))?.active).toBe(1);
  });
});
