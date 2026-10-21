import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";

const SUPERADMIN_ROLE_ID = 1; // is_system = true (seed-core-data.js)
const GESTOR_ROLE_ID = 6;

/**
 * Bug CRÍTICO encontrado en auditoría: `createUser`/`updateUser` forzaban
 * company_id y business_unit_id (nunca se confía en el body) pero pasaban
 * `roleIds` tal cual. El rol 1 es "Super Administrador" (is_system), y un
 * rol is_system recibe TODAS las rutas sin pasar por roles_resources — así
 * que un Administrador de empresa podía hacer
 * `PUT /user/update/<su id> { roleIds: 1 }` y quedarse con acceso a todas
 * las empresas del sistema.
 */
describe("Escalada de privilegios por asignación de rol", () => {
  let adminToken: string;
  let adminUserId: number;
  let businessUnitId: number;

  beforeAll(async () => {
    const auth = await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password);
    adminToken = auth.token;
    adminUserId = auth.userId;

    const units = await authedRequest(adminToken).get("/business-unit/list?page=1&limit=1");
    businessUnitId = units.body.data.data[0].id;
  });

  it("impide que un admin de empresa se auto-asigne el rol de plataforma", async () => {
    const res = await authedRequest(adminToken).put(`/user/update/${adminUserId}`, {
      roleIds: SUPERADMIN_ROLE_ID,
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/plataforma/i);
  });

  it("no deja rastro: el admin sigue sin ver empresas ajenas después del intento", async () => {
    // Si la escalada hubiera funcionado, /company/list (requireSystemRole)
    // devolvería 200 en vez de 403.
    const res = await authedRequest(adminToken).get("/company/list?page=1&limit=5");
    expect(res.status).not.toBe(200);
  });

  it("impide crear un usuario nuevo con el rol de plataforma", async () => {
    const stamp = wordStamp();
    const res = await authedRequest(adminToken).post("/user/create", {
      name: "Escalada",
      paternal_lastname: "Intento",
      document_type: 1,
      document_number: `${Date.now()}`.slice(-8),
      date_of_birth: "01/01/1990",
      email: `escalada.${stamp}@acme.test`,
      status: true,
      gender: 4,
      business_unit_id: businessUnitId,
      roleIds: SUPERADMIN_ROLE_ID,
    });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/plataforma/i);
  });

  it("sigue permitiendo asignar un rol plantilla normal (Gestor)", async () => {
    const stamp = wordStamp();
    const res = await authedRequest(adminToken).post("/user/create", {
      name: "Gestor",
      paternal_lastname: "Valido",
      document_type: 1,
      document_number: `${Date.now()}`.slice(-8),
      date_of_birth: "01/01/1990",
      email: `gestor.valido.${stamp}@acme.test`,
      status: true,
      gender: 4,
      business_unit_id: businessUnitId,
      roleIds: GESTOR_ROLE_ID,
    });

    expect(res.status).toBe(200);
  });

  it("rechaza un rol inexistente en vez de crear el usuario sin rol", async () => {
    const stamp = wordStamp();
    const res = await authedRequest(adminToken).post("/user/create", {
      name: "Rol",
      paternal_lastname: "Fantasma",
      document_type: 1,
      document_number: `${Date.now()}`.slice(-8),
      date_of_birth: "01/01/1990",
      email: `rol.fantasma.${stamp}@acme.test`,
      status: true,
      gender: 4,
      business_unit_id: businessUnitId,
      roleIds: 999999,
    });

    expect(res.status).toBe(404);
  });
});

/**
 * Hueco relacionado (otorgar a un rol accesos que el propio caller no tiene):
 * la regla "no puedes otorgar lo que tú no tienes" sigue en
 * grantResourcesToRole como defensa en profundidad, pero ya no se puede
 * ejercitar por HTTP desde una empresa: crear roles y asignar accesos pasó a
 * ser exclusivo del Super Administrador (requireSystemRole). Esa restricción
 * se prueba en roles-access-system-only.test.ts.
 */
