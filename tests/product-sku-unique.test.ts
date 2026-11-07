import { authedRequest, login, wordStamp } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

/**
 * Un SKU no se repite dentro de una empresa (reporte de QA: dos productos con
 * el SKU "PB1"). La regla vive en el service y no en un índice único: una base
 * con duplicados previos no podría aplicar esa migración, así que esos
 * productos tienen que poder seguir editándose. Empresas desechables.
 */
describe("Productos: SKU único por empresa", () => {
  let ctx: CashClosingTestCompany;
  let otherCtx: CashClosingTestCompany;
  let superToken: string;

  const newSku = () => `SKU-${wordStamp()}`.slice(0, 40);
  const createProduct = (sku: string, company = ctx) =>
    authedRequest(company.admin.token).post("/product/create", {
      company_id: company.companyId,
      name: `Taza ${wordStamp()}`,
      price_unit: 10,
      sku,
    });
  const updateProduct = (id: number, body: object) => authedRequest(ctx.admin.token).put(`/product/update/${id}`, body);

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    otherCtx = await createCashClosingTestCompany(superToken);
  }, 60_000);

  afterAll(async () => {
    for (const company of [ctx, otherCtx]) {
      if (company?.companyId) await authedRequest(superToken).put(`/company/disable/${company.companyId}`);
    }
  });

  it("no deja crear otro producto con el mismo SKU, ni cambiando mayúsculas", async () => {
    const sku = newSku();
    expect((await createProduct(sku)).status).toBeLessThan(300);

    for (const repeated of [sku, sku.toLowerCase()]) {
      const res = await createProduct(repeated);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("DUPLICATE_SKU");
      expect(res.body.message).toContain("ya lo usa");
    }
  });

  it("un producto deshabilitado también ocupa su SKU", async () => {
    const sku = newSku();
    const created = await createProduct(sku);
    const productId = created.body.data.id as number;
    expect((await authedRequest(ctx.admin.token).put(`/product/disable/${productId}`)).status).toBe(200);

    const res = await createProduct(sku);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain("deshabilitado");
  });

  it("no deja poner en un producto el SKU de otro", async () => {
    const taken = newSku();
    await createProduct(taken);
    const other = await createProduct(newSku());

    const res = await updateProduct(other.body.data.id, { sku: taken });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DUPLICATE_SKU");
  });

  it("guardar un producto con su propio SKU sigue funcionando", async () => {
    const sku = newSku();
    const created = await createProduct(sku);
    const res = await updateProduct(created.body.data.id, { sku, price_unit: 12 });
    expect(res.status).toBe(200);
  });

  it("el mismo SKU sí se puede usar en otra empresa, y varios productos pueden no tener SKU", async () => {
    const sku = newSku();
    expect((await createProduct(sku)).status).toBeLessThan(300);
    expect((await createProduct(sku, otherCtx)).status).toBeLessThan(300);

    expect((await createProduct("")).status).toBeLessThan(300);
    expect((await createProduct("")).status).toBeLessThan(300);
  });

  it("un duplicado que ya existía se puede seguir editando sin cambiar el SKU", async () => {
    const sku = newSku();
    const first = await createProduct(sku);
    const second = await createProduct(newSku());
    const secondId = second.body.data.id as number;
    // Simula datos previos a esta validación: la API ya no permite crearlos.
    await queryRows("UPDATE product SET sku = ? WHERE id = ?", [sku, secondId]);
    expect(first.status).toBeLessThan(300);

    const res = await updateProduct(secondId, { sku, price_unit: 20 });
    expect(res.status).toBe(200);
  });
});
