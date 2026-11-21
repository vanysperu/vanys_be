import request from "supertest";
import * as XLSX from "xlsx";
import { authedRequest, BASE_URL, login } from "./helpers/apiClient";
import { createCashClosingTestCompany, createPurchaseOrderFixture, createQuotationFixture, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const todayLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

/**
 * Pedido del usuario (21-nov): reportes en Excel de Cotizaciones, Caja y
 * pagos, Facturas e IGV, Inventario y compras — cada uno con las mismas filas
 * y filtros que su pantalla. Se lee cada archivo con SheetJS y se compara con
 * su listado. Empresa desechable (cotización 295 con IGV, cobro 118, compra
 * con factura 59).
 */
describe("Reportes en Excel", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let quotationId: number;
  const today = todayLima();
  const period = today.slice(0, 7);
  const admin = () => authedRequest(ctx.admin.token);

  // Baja el Excel y devuelve sus hojas como filas (la primera, los títulos).
  const download = async (path: string, token = ctx.admin.token) => {
    const res = await request(BASE_URL)
      .get(`/api${path}`)
      .set("Authorization", `Bearer ${token}`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      });
    const sheets: Record<string, unknown[][]> = {};
    if (res.status === 200) {
      const workbook = XLSX.read(res.body as Buffer, { type: "buffer" });
      workbook.SheetNames.forEach((name) => {
        sheets[name] = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name]!, { header: 1, raw: true, defval: null });
      });
    }
    return { status: res.status, type: String(res.headers["content-type"] ?? ""), disposition: String(res.headers["content-disposition"] ?? ""), sheets };
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    const fixture = await createQuotationFixture(ctx.admin.token, ctx.companyId);
    quotationId = fixture.quotationId;
    expect((await admin().put(`/quotation/update/${quotationId}`, { includes_igv: true })).status).toBe(200);
    expect((await admin().post(`/quotation/${quotationId}/payments`, { amount: 118, method: "cash", paid_at: today })).status).toBe(201);
    const { itemId } = await createPurchaseOrderFixture(ctx.admin.token, ctx.companyId, ctx.admin.userId, quotationId, fixture.quotationItemId, 10);
    const purchase = await admin().post(`/purchase-order/item/${itemId}/purchases`, {
      quantity: 10,
      amount: 59,
      funding_source: "company",
      has_invoice: true,
      spent_at: today,
    });
    expect(purchase.status).toBe(201);
  }, 120_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  it("cotizaciones: mismas filas que el listado, con estado y montos", async () => {
    const file = await download("/quotation/export");
    expect(file.status).toBe(200);
    expect(file.type).toContain(XLSX_TYPE);
    expect(file.disposition).toContain("cotizaciones-");
    const rows = file.sheets["Cotizaciones"]!;
    expect(rows[0]).toEqual(expect.arrayContaining(["Cotización", "Estado", "Cliente", "Total", "Pagado", "Saldo"]));
    const list = await admin().get("/quotation/list?page=1&limit=100");
    expect(rows.length - 1).toBe(list.body.data.meta.total);
    const row = rows.find((cells) => cells[0] === `COT-${String(quotationId).padStart(4, "0")}`)!;
    expect(row).toBeDefined();
    const header = rows[0] as string[];
    expect(row[header.indexOf("Total")]).toBe(295);
    expect(row[header.indexOf("Pagado")]).toBe(118);
    expect(row[header.indexOf("Saldo")]).toBe(177);
  });

  it("Caja: movimientos y resumen iguales al listado", async () => {
    const [file, list] = await Promise.all([download("/cash-movement/export"), admin().get("/cash-movement/list?page=1&limit=100")]);
    expect(file.status).toBe(200);
    expect(file.sheets["Movimientos"]!.length - 1).toBe(list.body.data.meta.total);
    const summary = file.sheets["Resumen"]!;
    const totalRow = summary[summary.length - 1]!;
    expect(totalRow[0]).toBe("Total");
    expect(totalRow[5]).toBe(list.body.data.summary.net);
  });

  it("pagos: el cobro de 118 con su cotización", async () => {
    const file = await download("/payment/export");
    expect(file.status).toBe(200);
    const rows = file.sheets["Pagos"]!;
    expect(rows.some((cells) => cells[1] === `COT-${String(quotationId).padStart(4, "0")}` && cells[6] === 118)).toBe(true);
  });

  it("facturas: la factura de compra con lo pagado", async () => {
    const file = await download("/invoice/export?type=purchase");
    expect(file.status).toBe(200);
    const rows = file.sheets["Facturas"]!;
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.slice(1).every((cells) => cells[0] === "De compra")).toBe(true);
  });

  it("IGV del mes: la cuenta, las ventas y las compras", async () => {
    const file = await download(`/cash-movement/igv-breakdown/export?period=${period}`);
    expect(file.status).toBe(200);
    expect(file.disposition).toContain(`igv-${period}`);
    expect(file.sheets["Cálculo"]!.slice(1).map((cells) => cells[1])).toEqual([18, 9, 9]);
    expect(file.sheets["Ventas"]!.length).toBe(3); // títulos + 1 cobro + total
    expect(file.sheets["Compras"]!.length).toBe(3); // títulos + 1 factura + total
  });

  it("órdenes de compra: una fila por producto con lo comprado", async () => {
    const file = await download("/purchase-order/export");
    expect(file.status).toBe(200);
    const rows = file.sheets["Órdenes de compra"]!;
    const header = rows[0] as string[];
    const row = rows.find((cells) => cells[header.indexOf("Cotización")] === `COT-${String(quotationId).padStart(4, "0")}`)!;
    expect(row[header.indexOf("Comprado (cant.)")]).toBe(10);
    expect(row[header.indexOf("Monto comprado")]).toBe(59);
  });

  it("stock: sin el inventario contratado, 403; con él, el Excel", async () => {
    expect((await download("/inventory/stock/export")).status).toBe(403);
    expect((await authedRequest(superToken).put(`/company-feature/${ctx.companyId}`, { features: { inventory: true } })).status).toBe(200);
    const file = await download("/inventory/stock/export");
    expect(file.status).toBe(200);
    expect(file.sheets["Stock"]![0]).toEqual(expect.arrayContaining(["Producto", "SKU", "Color", "Total"]));
  });

  it("el Gestor no exporta lo que no puede listar (cotizaciones sí, Caja según su rol)", async () => {
    const gestorList = await authedRequest(ctx.gestor.token).get("/cash-movement/list?page=1&limit=1");
    const gestorExport = await download("/cash-movement/export", ctx.gestor.token);
    // Mismo permiso que el listado: si no puede listar Caja, tampoco exportarla.
    expect(gestorExport.status === 200).toBe(gestorList.status === 200);
  });
});
