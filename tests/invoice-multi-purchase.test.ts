import request from "supertest";
import { authedRequest, BASE_URL, login } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import {
  createCashClosingTestCompany,
  createPurchaseOrderFixture,
  createQuotationFixture,
  type CashClosingTestCompany,
} from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const todayLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

interface PurchaseLine {
  purchase_id: number;
  product_name: string;
  quantity: number;
  amount: number;
  quotation_code: string;
}

interface InvoiceRow {
  id: number;
  has_file: boolean;
  quotation_codes: string[];
  purchases: PurchaseLine[];
  purchases_total: number;
  description: string;
}

interface OrderFixture {
  quotationId: number;
  itemId: number;
}

const cot = (id: number) => `COT-${String(id).padStart(4, "0")}`;

/**
 * Una factura de compra puede cubrir varios productos (pedido explícito del
 * usuario). Empresas desechables: nunca usa las cuentas QA del equipo.
 */
describe("Facturas: varias compras en una factura", () => {
  let ctx: CashClosingTestCompany;
  let otherCtx: CashClosingTestCompany;
  let invoiceId: number;
  let first: OrderFixture;
  let second: OrderFixture;
  let secondPurchaseId: number;
  let secondProductName: string;

  const admin = () => authedRequest(ctx.admin.token);

  const createOrder = async (token: string, company: CashClosingTestCompany, userId: number): Promise<OrderFixture> => {
    const fixture = await createQuotationFixture(token, company.companyId);
    const { itemId } = await createPurchaseOrderFixture(token, company.companyId, userId, fixture.quotationId, fixture.quotationItemId, 10);
    return { quotationId: fixture.quotationId, itemId };
  };

  const buy = (itemId: number, body: object, token = ctx.admin.token) =>
    authedRequest(token).post(`/purchase-order/item/${itemId}/purchases`, { quantity: 10, amount: 59, funding_source: "company", ...body });

  const listPurchaseInvoices = async (query = "") =>
    (await admin().get(`/invoice/list?type=purchase&limit=100${query}`)).body.data as {
      data: InvoiceRow[];
      summary: { pending_count: number };
    };

  const purchasesOfItem = async (itemId: number) =>
    (await queryRows<{ total: number }>("SELECT COUNT(*) AS total FROM purchase_order_item_purchase WHERE purchase_order_item_id = ?", [itemId]))[0]?.total;

  beforeAll(async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    otherCtx = await createCashClosingTestCompany(superToken);
    first = await createOrder(ctx.admin.token, ctx, ctx.admin.userId);
    second = await createOrder(ctx.admin.token, ctx, ctx.admin.userId);

    const created = await buy(first.itemId, { has_invoice: true });
    expect(created.status).toBe(201);
    invoiceId = created.body.data.invoice_id;
    const detail = await admin().get(`/quotation/find/${second.quotationId}`);
    secondProductName = detail.body.data.items[0].product.name;
  }, 60_000);

  afterAll(async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    for (const company of [ctx, otherCtx]) {
      if (company?.companyId) await authedRequest(superToken).put(`/company/disable/${company.companyId}`);
    }
  });

  it("ofrece la factura ya registrada al comprar otro producto de la misma tienda", async () => {
    const res = await admin().get(`/invoice/purchase-candidates?itemId=${second.itemId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((row: { id: number }) => row.id)).toEqual([invoiceId]);
    expect(res.body.data[0]).toMatchObject({ has_file: false, quotation_codes: [cot(first.quotationId)] });
  });

  it("otra empresa no ve las facturas de ese item", async () => {
    const res = await authedRequest(otherCtx.admin.token).get(`/invoice/purchase-candidates?itemId=${second.itemId}`);
    expect(res.status).toBe(403);
  });

  it("suma la compra a la factura elegida: una factura, dos productos, una sola por subir", async () => {
    const res = await buy(second.itemId, { has_invoice: true, invoice_id: invoiceId, amount: 118 });
    expect(res.status).toBe(201);
    expect(res.body.data.invoice_id).toBe(invoiceId);
    secondPurchaseId = res.body.data.id;

    const list = await listPurchaseInvoices();
    expect(list.data).toHaveLength(1);
    expect(list.summary.pending_count).toBe(1);
    const invoice = list.data[0] as InvoiceRow;
    expect(invoice.id).toBe(invoiceId);
    expect(invoice.purchases).toHaveLength(2);
    expect(invoice.purchases_total).toBe(177);
    expect(invoice.quotation_codes).toEqual([cot(first.quotationId), cot(second.quotationId)]);
    expect(invoice.description).toContain(secondProductName);
  });

  it("un solo archivo cubre todas sus compras", async () => {
    const upload = await request(BASE_URL)
      .post(`/api/invoice/${invoiceId}/file`)
      .set("Authorization", `Bearer ${ctx.admin.token}`)
      .attach("file", PNG_1X1, { filename: "factura.png", contentType: "image/png" });
    expect(upload.status).toBe(200);
    const list = await listPurchaseInvoices();
    expect(list.summary.pending_count).toBe(0);
    expect(list.data[0]).toMatchObject({ id: invoiceId, has_file: true });
  });

  it("la factura se encuentra por cualquiera de sus productos o cotizaciones", async () => {
    const byProduct = await listPurchaseInvoices(`&search=${encodeURIComponent(secondProductName)}`);
    expect(byProduct.data.map((row) => row.id)).toEqual([invoiceId]);
    const byQuotation = await listPurchaseInvoices(`&search=${encodeURIComponent(cot(second.quotationId))}`);
    expect(byQuotation.data.map((row) => row.id)).toEqual([invoiceId]);
    const nothing = await listPurchaseInvoices("&search=no-existe-nada");
    expect(nothing.data).toHaveLength(0);
  });

  it("IGV del mes y ganancia cuentan todas las compras de la factura", async () => {
    const period = todayLima().slice(0, 7);
    const summary = await admin().get(`/cash-movement/month-summary?period=${period}`);
    // (59 + 118) con 18% incluido = 27.
    expect(summary.body.data.igv_purchases).toBe(27);

    const profit = await admin().get(`/quotation/${second.quotationId}/profit`);
    expect(profit.body.data).toMatchObject({ purchases: 118, purchases_with_invoice: 118, igv_credit: 18 });
  });

  it("no acepta una factura de otra empresa y no deja la compra a medias", async () => {
    const foreign = await createOrder(otherCtx.admin.token, otherCtx, otherCtx.admin.userId);
    const res = await buy(foreign.itemId, { has_invoice: true, invoice_id: invoiceId }, otherCtx.admin.token);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVOICE_NOT_LINKABLE");
    expect(Number(await purchasesOfItem(foreign.itemId))).toBe(0);
  });

  it("no mezcla facturas entre tiendas", async () => {
    const inStore = await createOrder(ctx.storeAdmin.token, ctx, ctx.storeAdmin.userId);
    const res = await buy(inStore.itemId, { has_invoice: true, invoice_id: invoiceId }, ctx.storeAdmin.token);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVOICE_NOT_LINKABLE");
    expect(Number(await purchasesOfItem(inStore.itemId))).toBe(0);

    // Y al comprar en esa tienda no se ofrecen las de otra.
    const candidates = await authedRequest(ctx.storeAdmin.token).get(`/invoice/purchase-candidates?itemId=${inStore.itemId}`);
    expect(candidates.status).toBe(200);
    expect(candidates.body.data).toEqual([]);
  });

  it("no acepta una factura emitida", async () => {
    const quotation = await createOrder(ctx.admin.token, ctx, ctx.admin.userId);
    for (const status of ["design_pending", "in_process", "ready", "delivered"]) {
      expect((await admin().put(`/quotation/status/${quotation.quotationId}`, { status })).status).toBe(200);
    }
    const closed = await admin().put(`/quotation/status/${quotation.quotationId}`, { status: "finished", invoice_issued: true });
    const issuedId = closed.body.data.invoice_id as number;
    expect(issuedId).toBeGreaterThan(0);

    const open = await createOrder(ctx.admin.token, ctx, ctx.admin.userId);
    const res = await buy(open.itemId, { has_invoice: true, invoice_id: issuedId });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVOICE_NOT_LINKABLE");
  });

  it("sin has_invoice, invoice_id se ignora", async () => {
    const order = await createOrder(ctx.admin.token, ctx, ctx.admin.userId);
    const res = await buy(order.itemId, { has_invoice: false, invoice_id: invoiceId });
    expect(res.status).toBe(201);
    expect(res.body.data.invoice_id ?? null).toBeNull();
    const list = await listPurchaseInvoices();
    expect(list.data.find((row) => row.id === invoiceId)?.purchases).toHaveLength(2);
  });

  it("una compra anulada sale de la factura; la otra sigue", async () => {
    const annul = await admin().put(`/purchase-order/purchase/disable/${secondPurchaseId}`, {});
    expect(annul.status).toBe(200);
    const invoice = (await listPurchaseInvoices()).data.find((row) => row.id === invoiceId) as InvoiceRow;
    expect(invoice.purchases).toHaveLength(1);
    expect(invoice.purchases_total).toBe(59);
    expect(invoice.quotation_codes).toEqual([cot(first.quotationId)]);
  });
});
