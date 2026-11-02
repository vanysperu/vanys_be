import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const GLOBAL_FORBIDDEN_CODE = "GLOBAL_VARIABLE_FORBIDDEN";
const GLOBAL_CATEGORY = "payment_method"; // sembrada como catálogo global (seeder 20260919210000)

interface VariableRow {
  id: number;
  category: string;
  title: string;
  prefix_id: string;
  name: string;
  description: string | null;
  company_id: number | null;
  is_deleted: boolean;
}

interface ListBody {
  data: { data: VariableRow[]; meta: { total: number } };
}

/**
 * Regla de negocio: las variables globales (general_variable.company_id NULL)
 * solo las ve (en la pantalla de gestión) y modifica el Super Administrador.
 * El admin de empresa conserva la pantalla pero gestiona únicamente las suyas;
 * los selectores de otras pantallas (listado genérico) siguen leyendo las
 * globales (métodos de pago, etapas por defecto...).
 */
describe("Variables generales: las globales son del Super Administrador", () => {
  let adminToken: string;
  let superToken: string;
  let adminCompanyId: number;
  let globalRow: VariableRow;
  const createdOwnIds: number[] = [];

  beforeAll(async () => {
    adminToken = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token;
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;

    const me = await authedRequest(adminToken).get("/access/me");
    adminCompanyId = me.body.data.companyId;

    // Una fila global real para probar (se busca por API con el super admin).
    const list = await authedRequest(superToken).get(
      `/variable_general/list?admin=true&ignorePagination=true&category=${GLOBAL_CATEGORY}`
    );
    expect(list.status).toBe(200);
    const found = (list.body as ListBody).data.data.find((row) => row.company_id === null && !row.is_deleted);
    if (!found) throw new Error(`no hay variables globales de la categoría ${GLOBAL_CATEGORY}: corre los seeders`);
    globalRow = found;
  });

  afterAll(async () => {
    // Limpieza de las filas propias creadas por el test (borrado físico legacy).
    for (const id of createdOwnIds) {
      await authedRequest(adminToken).delete(`/variable_general/delete/${id}`);
    }
  });

  describe("listado", () => {
    it("modo gestión (scope=manage): el admin de empresa no recibe filas globales", async () => {
      const res = await authedRequest(adminToken).get("/variable_general/list?admin=true&ignorePagination=true&scope=manage");

      expect(res.status).toBe(200);
      const rows = (res.body as ListBody).data.data;
      expect(rows.some((row) => row.company_id === null)).toBe(false);
      expect(rows.every((row) => row.company_id === adminCompanyId)).toBe(true);
    });

    it("modo gestión: el admin tampoco ve las globales filtrando por una categoría global", async () => {
      const res = await authedRequest(adminToken).get(
        `/variable_general/list?admin=true&ignorePagination=true&scope=manage&category=${GLOBAL_CATEGORY}`
      );

      expect(res.status).toBe(200);
      expect((res.body as ListBody).data.data.some((row) => row.company_id === null)).toBe(false);
    });

    it("listado genérico (sin scope): el admin sigue recibiendo las globales para sus selectores", async () => {
      const res = await authedRequest(adminToken).get(
        `/variable_general/list?admin=true&ignorePagination=true&category=${GLOBAL_CATEGORY}`
      );

      expect(res.status).toBe(200);
      const rows = (res.body as ListBody).data.data;
      expect(rows.some((row) => row.id === globalRow.id && row.company_id === null)).toBe(true);
    });

    it("modo select (sin admin): el admin sigue recibiendo los métodos de pago globales", async () => {
      const res = await authedRequest(adminToken).get(
        `/variable_general/list?ignorePagination=true&category=${GLOBAL_CATEGORY}`
      );

      expect(res.status).toBe(200);
      const options = res.body.data as { value: string; name: string }[];
      expect(options.some((option) => option.value === globalRow.prefix_id)).toBe(true);
    });

    it("el Super Administrador, en modo gestión, sigue viendo las globales", async () => {
      const res = await authedRequest(superToken).get(
        `/variable_general/list?admin=true&ignorePagination=true&scope=manage&category=${GLOBAL_CATEGORY}`
      );

      expect(res.status).toBe(200);
      expect((res.body as ListBody).data.data.some((row) => row.id === globalRow.id)).toBe(true);
    });

    it("rechaza un valor de scope inválido", async () => {
      const res = await authedRequest(adminToken).get("/variable_general/list?admin=true&scope=todo");

      expect(res.status).toBe(400);
    });
  });

  describe("el admin de empresa NO toca una global", () => {
    it("detalle de una global: 403 con código estable", async () => {
      const res = await authedRequest(adminToken).get(`/variable_general/detail/${globalRow.id}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(GLOBAL_FORBIDDEN_CODE);
    });

    it("editar una global: 403 y la fila no cambia", async () => {
      const res = await authedRequest(adminToken).put(`/variable_general/update/${globalRow.id}`, {
        name: "Hackeado por admin",
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(GLOBAL_FORBIDDEN_CODE);

      const after = await authedRequest(superToken).get(`/variable_general/detail/${globalRow.id}`);
      expect(after.body.data.name).toBe(globalRow.name);
    });

    it("deshabilitar una global: 403 y la fila sigue activa", async () => {
      const res = await authedRequest(adminToken).put(`/variable_general/disable/${globalRow.id}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(GLOBAL_FORBIDDEN_CODE);

      const after = await authedRequest(superToken).get(`/variable_general/detail/${globalRow.id}`);
      expect(after.body.data.is_deleted).toBe(false);
    });

    it("eliminar una global: 403 y la fila sigue existiendo", async () => {
      const res = await authedRequest(adminToken).delete(`/variable_general/delete/${globalRow.id}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe(GLOBAL_FORBIDDEN_CODE);

      const after = await authedRequest(superToken).get(`/variable_general/detail/${globalRow.id}`);
      expect(after.status).toBe(200);
      expect(after.body.data).not.toBeNull();
    });

    it("crear con company_id null en el body igual queda en SU empresa (no crea una global)", async () => {
      const stamp = wordStamp();
      const res = await authedRequest(adminToken).post("/variable_general/create", {
        category: "qa_scope_probe",
        title: "Prueba de alcance",
        prefix_id: `probe_${stamp}`,
        name: `Probe ${stamp}`,
        company_id: null,
      });

      expect(res.status).toBe(200);
      createdOwnIds.push(res.body.data.id as number);
      expect(res.body.data.company_id).toBe(adminCompanyId);
    });

    it("una variable inexistente sigue siendo 404 (no 403)", async () => {
      const res = await authedRequest(adminToken).put("/variable_general/update/999999999", { name: "x" });

      expect(res.status).toBe(404);
    });
  });

  describe("el admin de empresa sí gestiona las suyas", () => {
    let ownId: number;
    const stamp = wordStamp();

    it("crea una variable propia y aparece en el modo gestión", async () => {
      const created = await authedRequest(adminToken).post("/variable_general/create", {
        category: "qa_scope_probe",
        title: "Prueba de alcance",
        prefix_id: `own_${stamp}`,
        name: `Propia ${stamp}`,
      });
      expect(created.status).toBe(200);
      ownId = created.body.data.id as number;
      createdOwnIds.push(ownId);
      expect(created.body.data.company_id).toBe(adminCompanyId);

      const list = await authedRequest(adminToken).get(
        "/variable_general/list?admin=true&ignorePagination=true&scope=manage&category=qa_scope_probe"
      );
      expect((list.body as ListBody).data.data.some((row) => row.id === ownId)).toBe(true);
    });

    it("lee el detalle y la edita; el body no puede moverla a otra empresa ni volverla global", async () => {
      const detail = await authedRequest(adminToken).get(`/variable_general/detail/${ownId}`);
      expect(detail.status).toBe(200);
      expect(detail.body.data.company_id).toBe(adminCompanyId);

      const updated = await authedRequest(adminToken).put(`/variable_general/update/${ownId}`, {
        name: `Editada ${stamp}`,
        company_id: null,
      });
      expect(updated.status).toBe(200);

      const after = await authedRequest(adminToken).get(`/variable_general/detail/${ownId}`);
      expect(after.body.data.name).toBe(`Editada ${stamp}`);
      expect(after.body.data.company_id).toBe(adminCompanyId);
    });

    it("la deshabilita y la vuelve a habilitar (toggle)", async () => {
      const off = await authedRequest(adminToken).put(`/variable_general/disable/${ownId}`);
      expect(off.status).toBe(200);
      expect((await authedRequest(adminToken).get(`/variable_general/detail/${ownId}`)).body.data.is_deleted).toBe(true);

      const on = await authedRequest(adminToken).put(`/variable_general/disable/${ownId}`);
      expect(on.status).toBe(200);
      expect((await authedRequest(adminToken).get(`/variable_general/detail/${ownId}`)).body.data.is_deleted).toBe(false);
    });
  });

  describe("el Super Administrador sí gestiona las globales", () => {
    it("ve el detalle y edita una global (se restaura el valor al final)", async () => {
      const original = globalRow.description ?? "";
      const marker = `QA scope ${wordStamp()}`.slice(0, 60);

      try {
        const detail = await authedRequest(superToken).get(`/variable_general/detail/${globalRow.id}`);
        expect(detail.status).toBe(200);
        expect(detail.body.data.company_id).toBeNull();

        const updated = await authedRequest(superToken).put(`/variable_general/update/${globalRow.id}`, {
          description: marker,
        });
        expect(updated.status).toBe(200);

        const after = await authedRequest(superToken).get(`/variable_general/detail/${globalRow.id}`);
        expect(after.body.data.description).toBe(marker);
        expect(after.body.data.company_id).toBeNull();
      } finally {
        await authedRequest(superToken).put(`/variable_general/update/${globalRow.id}`, { description: original });
      }

      const restored = await authedRequest(superToken).get(`/variable_general/detail/${globalRow.id}`);
      expect(restored.body.data.description).toBe(original);
    });
  });
});
