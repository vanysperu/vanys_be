import { authedRequest, login } from "./helpers/apiClient";
import { createCashClosingTestCompany, createPurchaseOrderFixture, createQuotationFixture, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

const todayLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

interface Breakdown {
  period: string;
  igv_rate: number | null;
  sales: { lines: { quotation_id: number; amount: number; base: number; igv: number; invoice_issued: boolean }[]; total_igv: number; total_amount: number };
  purchases: { lines: { invoice_id: number; amount: number; base: number; igv: number; quotation_ids: number[] }[]; total_igv: number; total_amount: number };
  igv_balance: number;
  igv_payable: number;
}

/**
 * Pedido del usuario (21-nov): en Caja, ver CÓMO se llegó al IGV a pagar —
 * qué cobros (con su IGV) y qué compras con factura (con su IGV) lo forman.
 * Mismo escenario que finance-summary: cotización 250 + IGV = 295, cobrado
 * 118 (IGV 18); compra con factura 59 (IGV 9) → a pagar 9. Los totales del
 * detalle deben ser IGUALES al resumen del mes. Empresa desechable.
 */
describe("Caja: detalle del IGV del mes", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let quotationId: number;
  const today = todayLima();
  const period = today.slice(0, 7);
  const admin = () => authedRequest(ctx.admin.token);

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
  }, 90_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  it("muestra cada cobro y cada factura de compra con su IGV, y la cuenta final", async () => {
    const res = await admin().get(`/cash-movement/igv-breakdown?period=${period}`);
    expect(res.status).toBe(200);
    const breakdown = res.body.data as Breakdown;
    expect(breakdown.period).toBe(period);
    expect(breakdown.igv_rate).toBe(0.18);

    expect(breakdown.sales.lines).toHaveLength(1);
    expect(breakdown.sales.lines[0]).toMatchObject({ quotation_id: quotationId, amount: 118, base: 100, igv: 18, invoice_issued: false });
    expect(breakdown.sales.total_igv).toBe(18);

    expect(breakdown.purchases.lines).toHaveLength(1);
    expect(breakdown.purchases.lines[0]).toMatchObject({ amount: 59, base: 50, igv: 9, quotation_ids: [quotationId] });
    expect(breakdown.purchases.total_igv).toBe(9);

    expect(breakdown.igv_balance).toBe(9);
    expect(breakdown.igv_payable).toBe(9);
  });

  it("los totales del detalle son los mismos del resumen del mes", async () => {
    const [summary, breakdown] = await Promise.all([
      admin().get(`/cash-movement/month-summary?period=${period}`),
      admin().get(`/cash-movement/igv-breakdown?period=${period}`),
    ]);
    expect(breakdown.body.data.sales.total_igv).toBe(summary.body.data.igv_sales);
    expect(breakdown.body.data.purchases.total_igv).toBe(summary.body.data.igv_purchases);
    expect(breakdown.body.data.igv_balance).toBe(summary.body.data.igv_balance);
    expect(breakdown.body.data.igv_payable).toBe(summary.body.data.igv_payable);
  });

  it("un mes sin movimientos responde vacío y un mes mal escrito, 400", async () => {
    const empty = await admin().get("/cash-movement/igv-breakdown?period=2020-01");
    expect(empty.status).toBe(200);
    expect(empty.body.data.sales.lines).toHaveLength(0);
    expect(empty.body.data.igv_payable).toBe(0);
    expect((await admin().get("/cash-movement/igv-breakdown?period=2026-13")).status).toBe(400);
  });
});
