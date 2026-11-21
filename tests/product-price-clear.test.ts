import { authedRequest, login, wordStamp } from "./helpers/apiClient";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

/**
 * Pedido del usuario (21-nov): al editar un producto y BORRAR su precio por
 * unidad, se quedaba el monto viejo. Vaciar un precio debe dejarlo sin precio
 * (null). El frontend ahora manda null; el backend debe guardarlo, y seguir
 * exigiendo al menos un precio. Lo mismo en técnicas. Empresa desechable.
 */
describe("Precios que se pueden borrar al editar", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  const admin = () => authedRequest(ctx.admin.token);

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
  }, 90_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  it("producto: null borra el precio por unidad; undefined lo conserva; 0 guarda 0", async () => {
    const created = await admin().post("/product/create", {
      company_id: ctx.companyId,
      name: `Polo Precio ${wordStamp().slice(0, 6)}`,
      price_unit: 25,
      price_hundred: 2000,
    });
    expect(created.status).toBeLessThan(300);
    const id = created.body.data.id as number;
    const name = created.body.data.name as string;
    // No hay GET por id: se busca en el listado por nombre (único por stamp).
    const find = async () => {
      const list = await admin().get(`/product/list?page=1&limit=10&name=${encodeURIComponent(name)}`);
      return (list.body.data.data as { id: number; price_unit: string | null; price_hundred: string | null }[]).find((row) => row.id === id)!;
    };

    // Sin mandar el campo: se conserva (comportamiento de siempre).
    expect((await admin().put(`/product/update/${id}`, { name })).status).toBe(200);
    expect(Number((await find()).price_unit)).toBe(25);

    // null (campo vaciado en el formulario): queda sin precio.
    expect((await admin().put(`/product/update/${id}`, { price_unit: null })).status).toBe(200);
    expect((await find()).price_unit).toBeNull();
    expect(Number((await find()).price_hundred)).toBe(2000);

    // 0 es un precio válido y distinto de "vacío".
    expect((await admin().put(`/product/update/${id}`, { price_unit: 0 })).status).toBe(200);
    expect(Number((await find()).price_unit)).toBe(0);

    // Borrar TODOS los precios no se permite.
    const none = await admin().put(`/product/update/${id}`, {
      price_unit: null,
      price_hundred: null,
      price_half_thousand: null,
      price_thousand: null,
    });
    expect(none.status).toBe(400);
    expect(none.body.code).toBe("PRICE_REQUIRED");
  });

  it("técnica: null borra el precio y se exige al menos uno al editar", async () => {
    const created = await admin().post("/customization-technique/create", {
      company_id: ctx.companyId,
      name: `Serigrafia ${wordStamp().slice(0, 6)}`,
      price_unit: 3,
      price_thousand: 1500,
    });
    expect(created.status).toBeLessThan(300);
    const id = created.body.data.id as number;
    const name = created.body.data.name as string;
    const find = async () => {
      const list = await admin().get(`/customization-technique/list?page=1&limit=10&name=${encodeURIComponent(name)}`);
      return (list.body.data.data as { id: number; price_unit: string | null; price_thousand: string | null }[]).find((row) => row.id === id)!;
    };

    expect((await admin().put(`/customization-technique/update/${id}`, { price_unit: null })).status).toBe(200);
    expect((await find()).price_unit).toBeNull();
    expect(Number((await find()).price_thousand)).toBe(1500);

    const none = await admin().put(`/customization-technique/update/${id}`, { price_thousand: null });
    expect(none.status).toBe(400);
    expect(none.body.code).toBe("PRICE_REQUIRED");
    expect(Number((await find()).price_thousand)).toBe(1500);
  });
});
