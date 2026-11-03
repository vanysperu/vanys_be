import request from "supertest";
import { authedRequest, BASE_URL, login, QA_COMPANY_ADMIN } from "./helpers/apiClient";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

/**
 * Pantalla "API keys": solo el Super Administrador (pedido explícito del
 * usuario). La key completa se devuelve una sola vez al crearla; revocar es
 * de una sola vía y la key deja de autenticar al instante.
 */
describe("Gestión de API keys (solo Super Administrador)", () => {
  let superToken: string;
  let adminToken: string;
  let companyId: number;
  let businessUnitId: number | null;

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    adminToken = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    const me = (await authedRequest(adminToken).get("/access/me")).body.data;
    companyId = me.companyId;
    businessUnitId = me.businessUnitId ?? null;
  });

  it("un administrador de empresa no puede listar, crear ni ve el módulo en su menú", async () => {
    const admin = authedRequest(adminToken);
    expect((await admin.get("/api-key/list")).status).toBe(403);
    expect((await admin.post("/api-key/create", { company_id: companyId, name: "Intrusa" })).status).toBe(403);

    const access = (await admin.get("/access/me")).body.data;
    expect(access.modules).not.toContain("api_key");
    expect(access.buttons).not.toContain("api_key.create.button");
  });

  it("crea, lista, edita y revoca; la key funciona hasta que se revoca", async () => {
    const api = authedRequest(superToken);

    const created = await api.post("/api-key/create", {
      company_id: companyId,
      business_unit_id: businessUnitId,
      name: "Jest pantalla",
    });
    expect(created.status).toBe(201);
    const plainKey: string = created.body.data.plain_key;
    expect(plainKey).toMatch(/^vnk_/);
    expect(created.body.data.key_prefix).toBe(plainKey.slice(0, 12));
    const id: number = created.body.data.id;

    // El listado nunca trae la key completa ni su hash.
    const list = await api.get(`/api-key/list?companyId=${companyId}&status=active&limit=100`);
    expect(list.status).toBe(200);
    const row = list.body.data.data.find((item: { id: number }) => item.id === id);
    expect(row).toBeDefined();
    expect(row.plain_key).toBeUndefined();
    expect(row.key_hash).toBeUndefined();
    expect(row.is_revoked).toBe(false);

    // La key autentica en el endpoint público (body vacío -> 400, no 401).
    const works = await request(BASE_URL).post("/api/public/quotation-request").set("X-Api-Key", plainKey).send({});
    expect(works.status).toBe(400);

    const renamed = await api.put(`/api-key/update/${id}`, { name: "Jest renombrada", business_unit_id: null });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe("Jest renombrada");
    expect(renamed.body.data.business_unit).toBeNull();

    const revoked = await api.put(`/api-key/disable/${id}`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.is_revoked).toBe(true);
    expect(revoked.body.data.revoked_at).not.toBeNull();

    const stopped = await request(BASE_URL).post("/api/public/quotation-request").set("X-Api-Key", plainKey).send({});
    expect(stopped.status).toBe(401);

    // De una sola vía: no se revoca dos veces ni se edita una revocada.
    expect((await api.put(`/api-key/disable/${id}`)).status).toBe(409);
    expect((await api.put(`/api-key/update/${id}`, { name: "Otra" })).status).toBe(409);
  });

  it("rechaza una tienda de otra empresa y una empresa inexistente", async () => {
    const api = authedRequest(superToken);
    expect((await api.post("/api-key/create", { company_id: 999999999, name: "X" })).status).toBe(400);

    const foreignStore = await api.post("/api-key/create", { company_id: companyId, business_unit_id: 999999999, name: "X" });
    expect(foreignStore.status).toBe(400);

    const noName = await api.post("/api-key/create", { company_id: companyId, name: "  " });
    expect(noName.status).toBe(400);
  });
});
