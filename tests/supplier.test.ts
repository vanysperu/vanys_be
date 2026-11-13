import { authedRequest, login, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

interface SupplierRow {
  id: number;
  name: string;
  active: boolean;
  company_id: number;
}

/**
 * Sprint 2, base común (plan §3.1 y §3.2): funcionalidades por empresa,
 * módulo mínimo de Proveedores (D7) y códigos de producto únicos POR proveedor
 * (D6). Dos empresas desechables para probar el aislamiento.
 */
describe("Proveedores, funcionalidades por empresa y códigos por proveedor", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let other: CashClosingTestCompany;
  const admin = () => authedRequest(ctx.admin.token);
  const stamp = wordStamp().slice(0, 8);

  const createSupplier = async (name: string) => {
    const res = await admin().post("/supplier/create", { name, document_number: `20${Date.now().toString().slice(-9)}` });
    expect(res.status).toBe(201);
    return res.body.data as SupplierRow;
  };
  const createProduct = (name: string, codes: object[]) =>
    admin().post("/product/create", { company_id: ctx.companyId, name, price_unit: 10, codes });

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    other = await createCashClosingTestCompany(superToken);
  }, 90_000);

  it("solo el Super Administrador prende funcionalidades; /access/me las informa", async () => {
    expect((await admin().get(`/company-feature/${ctx.companyId}`)).status).toBe(403);
    expect((await admin().put(`/company-feature/${ctx.companyId}`, { features: { supplier_stock: true } })).status).toBe(403);

    const superApi = authedRequest(superToken);
    const unknown = await superApi.put(`/company-feature/${ctx.companyId}`, { features: { teleport: true } });
    expect(unknown.status).toBe(400);

    const saved = await superApi.put(`/company-feature/${ctx.companyId}`, { features: { supplier_stock: true } });
    expect(saved.status).toBe(200);
    // La respuesta trae todas las funcionalidades del catálogo (crece con cada ítem): solo se
    // comprueba la que se prendió y que las demás siguen apagadas.
    expect(saved.body.data).toContainEqual(expect.objectContaining({ code: "supplier_stock", enabled: true }));
    expect(saved.body.data.filter((feature: { enabled: boolean }) => feature.enabled)).toHaveLength(1);

    const me = await admin().get("/access/me");
    expect(me.body.data.features).toEqual(["supplier_stock"]);
    const otherMe = await authedRequest(other.admin.token).get("/access/me");
    expect(otherMe.body.data.features).toEqual([]);
  });

  it("crea, lista, edita y deshabilita proveedores; el nombre se repite solo entre empresas", async () => {
    const supplier = await createSupplier(`Importadora Norte ${stamp}`);
    expect(supplier.company_id).toBe(ctx.companyId);

    const duplicated = await admin().post("/supplier/create", { name: `importadora norte ${stamp}` });
    expect(duplicated.status).toBe(409);
    // Otra empresa puede tener un proveedor con el mismo nombre.
    expect((await authedRequest(other.admin.token).post("/supplier/create", { name: `Importadora Norte ${stamp}` })).status).toBe(201);

    const list = await admin().get(`/supplier/list?page=1&limit=10&searchTerm=${encodeURIComponent("Norte")}`);
    expect(list.status).toBe(200);
    expect((list.body.data.data as SupplierRow[]).map((row) => row.id)).toEqual([supplier.id]);
    expect(list.body.data.meta).toMatchObject({ page: 1, limit: 10, total: 1 });

    const updated = await admin().put(`/supplier/update/${supplier.id}`, { name: `Importadora Norte SAC ${stamp}`, is_carrier: false });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe(`Importadora Norte SAC ${stamp}`);

    const disabled = await admin().put(`/supplier/disable/${supplier.id}`);
    expect(disabled.body.data.active).toBe(false);
    const enabled = await admin().put(`/supplier/disable/${supplier.id}`);
    expect(enabled.body.data.active).toBe(true);

    // Proveedor de otra empresa: no existe para este usuario.
    expect((await authedRequest(other.admin.token).put(`/supplier/update/${supplier.id}`, { name: "Ajeno" })).status).toBe(404);
    // El Gestor no administra proveedores (es configuración).
    expect((await authedRequest(ctx.gestor.token).get("/supplier/list")).status).toBe(403);
  });

  it("D6: el mismo código puede ir con dos proveedores, pero no dos veces con el mismo", async () => {
    const north = await createSupplier(`Proveedor Uno ${stamp}`);
    const south = await createSupplier(`Proveedor Dos ${stamp}`);
    const code = `E${Date.now().toString().slice(-6)}`;

    const first = await createProduct(`Taza Norte ${stamp}`, [{ code, supplier_id: north.id }]);
    expect(first.status).toBe(201);
    const second = await createProduct(`Taza Sur ${stamp}`, [{ code, supplier_id: south.id }]);
    expect(second.status).toBe(201);

    const taken = await createProduct(`Taza Repetida ${stamp}`, [{ code, supplier_id: north.id }]);
    expect(taken.status).toBe(409);
    expect(taken.body.message).toContain(`Proveedor Uno ${stamp}`);

    const repeatedInside = await createProduct(`Taza Doble ${stamp}`, [
      { code: `X${code}`, supplier_id: north.id },
      { code: `x${code}`, supplier_id: north.id },
    ]);
    expect(repeatedInside.status).toBe(400);

    // Un proveedor de otra empresa no se puede usar.
    const foreign = await authedRequest(other.admin.token).post("/supplier/create", { name: `Ajeno ${stamp}` });
    const withForeign = await createProduct(`Taza Ajena ${stamp}`, [{ code: `Y${code}`, supplier_id: foreign.body.data.id }]);
    expect(withForeign.status).toBe(400);
    expect(withForeign.body.code).toBe("SUPPLIER_NOT_FOUND");

    // Editar el proveedor actualiza el nombre guardado en sus códigos.
    await admin().put(`/supplier/update/${north.id}`, { name: `Proveedor Uno Renombrado ${stamp}` });
    const rows = await queryRows<{ supplier: string }>("SELECT supplier FROM product_code WHERE supplier_id = ?", [north.id]);
    expect(rows.map((row) => row.supplier)).toEqual([`Proveedor Uno Renombrado ${stamp}`]);
  });

  it("integraciones que mandan el proveedor como texto: se busca o se crea por nombre", async () => {
    const name = `Texto Libre ${stamp}`;
    const res = await createProduct(`Llavero ${stamp}`, [{ code: `T${Date.now().toString().slice(-6)}`, supplier: name }]);
    expect(res.status).toBe(201);
    const created = await queryRows<{ id: number }>("SELECT id FROM supplier WHERE company_id = ? AND name = ?", [ctx.companyId, name]);
    expect(created).toHaveLength(1);

    const again = await createProduct(`Llavero Dos ${stamp}`, [{ code: `U${Date.now().toString().slice(-6)}`, supplier: name.toUpperCase() }]);
    expect(again.status).toBe(201);
    const still = await queryRows<{ id: number }>("SELECT id FROM supplier WHERE company_id = ? AND name = ?", [ctx.companyId, name]);
    expect(still).toHaveLength(1);
  });
});
