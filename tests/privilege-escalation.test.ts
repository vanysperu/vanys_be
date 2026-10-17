import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
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
 * Hueco relacionado: `grantResourcesToRole` insertaba cualquier resource_id
 * del catálogo global. Un Administrador de empresa podía otorgarle a su
 * propio rol accesos de plataforma que su rol nunca tuvo. Ahora rige
 * "no puedes otorgar lo que tú no tienes".
 */
describe("Otorgar accesos a un rol: no puedes dar lo que no tienes", () => {
  let adminToken: string;
  let superToken: string;
  let ownRoleId: number;
  let forbiddenResourceId: number;

  beforeAll(async () => {
    adminToken = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;

    // Rol propio de la empresa (el admin sí puede editar sus accesos).
    const created = await authedRequest(adminToken).post("/role/create", {
      name: `RolPrueba${wordStamp().slice(0, 8)}`,
      description: "Rol creado por el test de escalada",
    });
    ownRoleId = created.body.data.id;

    // Un resource que el propio admin NO tiene otorgado: se busca
    // comparando el catálogo completo (solo visible para is_system) contra
    // el árbol del rol Administrador plantilla.
    const allResources = await authedRequest(superToken).get("/resource/list?page=1&limit=100");
    const adminTree = await authedRequest(superToken).get("/roles/2/resources");

    const grantedIds = new Set<number>(collectGrantedIds(adminTree.body.data));
    const candidate = (allResources.body.data.data as { id: number }[]).find((r) => !grantedIds.has(r.id));
    forbiddenResourceId = candidate!.id;
  });

  it("encuentra un acceso de plataforma que el Administrador no tiene (precondición)", () => {
    expect(forbiddenResourceId).toBeGreaterThan(0);
  });

  it("ignora silenciosamente el intento de otorgar un acceso que el caller no posee", async () => {
    const res = await authedRequest(adminToken).put(`/roles/${ownRoleId}/resources`, {
      resourceIds: { add: [forbiddenResourceId], remove: [] },
    });
    expect(res.status).toBe(200);

    // Lo importante no es el status, sino que NO se haya guardado.
    const tree = await authedRequest(superToken).get(`/roles/${ownRoleId}/resources`);
    expect(collectGrantedIds(tree.body.data)).not.toContain(forbiddenResourceId);
  });
});

// El árbol viene anidado (módulos -> resources); se aplanan los ids que
// figuran como otorgados, sea cual sea la forma exacta del nodo.
function collectGrantedIds(tree: unknown): number[] {
  const ids: number[] = [];

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node === null || typeof node !== "object") return;

    const row = node as Record<string, unknown>;
    if (typeof row.id === "number" && row.granted === true) ids.push(row.id);

    Object.values(row).forEach(walk);
  };

  walk(tree);
  return ids;
}
