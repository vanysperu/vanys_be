import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const SUPERADMIN_ROLE_ID = 1; // is_system: su árbol trae TODO el catálogo
const GESTOR_ROLE_ID = 6; // plantilla de empresa
const VIEW_ALL_BUSINESS_UNITS_CODE = "roles_access.viewAllBusinessUnits.button";
const ROLE_CREATE_CODE = "roles_access.role.create.button";

interface TreeNode {
  id: number;
  code: string;
  granted: boolean;
  children: TreeNode[];
}

interface TreeModule {
  code: string;
  resources: TreeNode[];
}

const flattenTree = (modules: TreeModule[]): TreeNode[] => {
  const walk = (nodes: TreeNode[]): TreeNode[] => nodes.flatMap((node) => [node, ...walk(node.children)]);
  return modules.flatMap((module) => walk(module.resources));
};

/**
 * Pedido explícito del usuario: "solo el super admin vea lo de módulos y
 * accesos de roles". Roles y accesos (roles, accesos por rol, catálogo de
 * módulos/recursos) es exclusivo del Super Administrador
 * (src/core/rbac/systemOnlyModules.ts + seeder 20261021150000).
 */
describe("Roles y accesos: exclusivo del Super Administrador", () => {
  let adminToken: string;
  let superToken: string;
  let adminCompanyId: number;

  beforeAll(async () => {
    adminToken = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;

    const me = await authedRequest(adminToken).get("/access/me");
    adminCompanyId = me.body.data.companyId;
  });

  it("el administrador de empresa no tiene el módulo en su menú", async () => {
    const res = await authedRequest(adminToken).get("/access/me");

    expect(res.status).toBe(200);
    expect(res.body.data.modules).not.toContain("roles_access");
    expect((res.body.data.views as { code: string }[]).map((module) => module.code)).not.toContain("roles_access");
  });

  it.each([
    ["POST", "/role/create", { name: "Rol No Permitido" }],
    ["PUT", `/role/update/${GESTOR_ROLE_ID}`, { name: "Gestor" }],
    ["PUT", `/role/disable/${GESTOR_ROLE_ID}`, undefined],
    ["GET", `/roles/${GESTOR_ROLE_ID}/resources`, undefined],
    ["PUT", `/roles/${GESTOR_ROLE_ID}/resources`, { resourceIds: { add: [1], remove: [] } }],
    ["GET", "/module/list?page=1&limit=10", undefined],
    ["GET", "/resource/list?page=1&limit=10", undefined],
  ] as const)("rechaza al administrador de empresa: %s %s", async (method, path, body) => {
    const client = authedRequest(adminToken);
    const res =
      method === "GET" ? await client.get(path) : method === "POST" ? await client.post(path, body) : await client.put(path, body);

    expect(res.status).toBe(403);
  });

  it("el administrador sigue listando roles para el formulario de Usuarios (los suyos y las plantillas)", async () => {
    const res = await authedRequest(adminToken).get("/role/list?page=1&limit=100");

    expect(res.status).toBe(200);
    const rows = res.body.data.rows as { is_system: boolean; company_id: number | null }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((role) => role.is_system)).toBe(false);
    expect(rows.every((role) => role.company_id === null || role.company_id === adminCompanyId)).toBe(true);
  });

  it("al configurar un rol de empresa, el árbol no ofrece lo exclusivo pero sí 'Ver todas las tiendas'", async () => {
    const res = await authedRequest(superToken).get(`/roles/${GESTOR_ROLE_ID}/resources`);

    expect(res.status).toBe(200);
    const codes = flattenTree(res.body.data.modules).map((node) => node.code);
    expect(codes).toContain(VIEW_ALL_BUSINESS_UNITS_CODE);
    expect(codes).toContain("users.roleOptions.endpoint");
    expect(codes).not.toContain("roles_access.list");
    expect(codes).not.toContain(ROLE_CREATE_CODE);
  });

  it("el Super Administrador crea un rol para una empresa y no puede otorgarle lo exclusivo", async () => {
    const created = await authedRequest(superToken).post("/role/create", {
      name: `RolPrueba${wordStamp().slice(0, 8)}`,
      description: "Rol creado por el test de roles exclusivos",
      company_id: adminCompanyId,
    });
    expect(created.status).toBe(200);
    const roleId: number = created.body.data.id;
    expect(created.body.data.company_id).toBe(adminCompanyId);

    const fullTree = await authedRequest(superToken).get(`/roles/${SUPERADMIN_ROLE_ID}/resources`);
    const allNodes = flattenTree(fullTree.body.data.modules);
    const idOf = (code: string) => allNodes.find((node) => node.code === code)?.id;
    const createId = idOf(ROLE_CREATE_CODE);
    const viewAllId = idOf(VIEW_ALL_BUSINESS_UNITS_CODE);
    expect(createId).toBeDefined();
    expect(viewAllId).toBeDefined();

    const saved = await authedRequest(superToken).put(`/roles/${roleId}/resources`, {
      resourceIds: { add: [createId, viewAllId], remove: [] },
    });
    expect(saved.status).toBe(200);

    const tree = await authedRequest(superToken).get(`/roles/${roleId}/resources`);
    const granted = flattenTree(tree.body.data.modules)
      .filter((node) => node.granted)
      .map((node) => node.code);
    expect(granted).toContain(VIEW_ALL_BUSINESS_UNITS_CODE);
    expect(granted).not.toContain(ROLE_CREATE_CODE);

    // Limpieza: el rol de prueba queda deshabilitado.
    await authedRequest(superToken).put(`/role/disable/${roleId}`);
  });

  it("rechaza crear un rol para una empresa inexistente", async () => {
    const res = await authedRequest(superToken).post("/role/create", {
      name: "Rol Empresa Fantasma",
      company_id: 999999,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/empresa/i);
  });
});
