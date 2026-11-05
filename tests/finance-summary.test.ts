import { authedRequest, login } from "./helpers/apiClient";
import { createCashClosingTestCompany, createPurchaseOrderFixture, createQuotationFixture, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

// Hoy en Lima (YYYY-MM-DD) y su mes.
const todayLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

interface PeriodFinance {
  period: string;
  income: number;
  expenses: number;
  adjustments: number;
  result: number;
  igv_sales: number;
  igv_purchases: number;
  igv_balance: number;
  igv_payable: number;
  net_after_igv: number;
}

interface CategoryAmount {
  key: string;
  label: string;
  amount: number;
}

/**
 * Ganancia por cotización, resumen del mes de Caja (resultado + IGV para
 * SUNAT), neto de cada cierre e ingresos/egresos por categoría en
 * Estadísticas (pedido explícito del usuario). Empresa desechable con su caja
 * configurada; nunca usa las cuentas QA del equipo.
 *
 * Datos del mes: cotización de 250 + IGV 18% = 295, cobrado 118 (IGV 18);
 * compra con factura 59 (IGV 9); gasto 20; ingreso manual 100; egreso manual 30.
 */
describe("Ganancia, resumen del mes e IGV", () => {
  let ctx: CashClosingTestCompany;
  let quotationId: number;
  const today = todayLima();
  const period = today.slice(0, 7);

  const admin = () => authedRequest(ctx.admin.token);

  beforeAll(async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    expect(
      (
        await admin().put("/cash-closing/opening", {
          start_period: period,
          openings: [{ payment_account_id: null, amount: 0 }],
          notes: "Prueba de ganancia",
        })
      ).status
    ).toBe(200);

    const fixture = await createQuotationFixture(ctx.admin.token, ctx.companyId);
    quotationId = fixture.quotationId;
    expect((await admin().put(`/quotation/update/${quotationId}`, { includes_igv: true })).status).toBe(200);
    const detail = await admin().get(`/quotation/find/${quotationId}`);
    expect(Number(detail.body.data.total)).toBe(295);

    expect((await admin().post(`/quotation/${quotationId}/payments`, { amount: 118, method: "cash", paid_at: today })).status).toBe(201);
    expect(
      (await admin().post(`/quotation/${quotationId}/expenses`, { description: "Delivery", amount: 20, spent_at: today })).status
    ).toBe(201);
    const { itemId } = await createPurchaseOrderFixture(ctx.admin.token, ctx.companyId, ctx.admin.userId, quotationId, fixture.quotationItemId, 10);
    const purchase = await admin().post(`/purchase-order/item/${itemId}/purchases`, {
      quantity: 10,
      amount: 59,
      funding_source: "company",
      has_invoice: true,
      spent_at: today,
    });
    expect(purchase.status).toBe(201);

    for (const movement of [
      { direction: "income", category: "otro_ingreso", amount: 100 },
      { direction: "expense", category: "otro_egreso", amount: 30 },
    ]) {
      expect((await admin().post("/cash-movement/create", { ...movement, occurred_at: today })).status).toBe(201);
    }
  });

  afterAll(async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  it("la ganancia de la cotización descuenta IGV, gastos y compras, y suma el IGV recuperable", async () => {
    const res = await admin().get(`/quotation/${quotationId}/profit`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      total: 295,
      subtotal: 250,
      igv_total: 45,
      payments_received: 118,
      igv_in_payments: 18,
      pending: 177,
      expenses: 20,
      purchases: 59,
      purchases_with_invoice: 59,
      igv_credit: 9,
      // 118 − 18 − 20 − 59 + 9
      net_profit: 30,
      // 250 − 20 − 59 + 9
      projected_profit: 180,
    });
  });

  it("un Gestor no ve la ganancia (permiso solo de administradores)", async () => {
    const res = await authedRequest(ctx.gestor.token).get(`/quotation/${quotationId}/profit`);
    expect(res.status).toBe(403);
  });

  it("el resumen del mes da resultado, IGV a pagar y neto después del IGV", async () => {
    const res = await admin().get(`/cash-movement/month-summary?period=${period}`);
    expect(res.status).toBe(200);
    const summary = res.body.data as PeriodFinance & { is_current: boolean };
    expect(summary).toMatchObject({
      period,
      is_current: true,
      income: 218, // 118 + 100
      expenses: 109, // 20 + 59 + 30
      result: 109,
      igv_sales: 18,
      igv_purchases: 9,
      igv_balance: 9,
      igv_payable: 9,
      net_after_igv: 100,
    });
  });

  it("Cierres muestra el mismo resultado e IGV en el mes (lista y detalle)", async () => {
    const list = await admin().get("/cash-closing/list?page=1&limit=12");
    expect(list.status).toBe(200);
    const row = (list.body.data.data as { period: string; finance: PeriodFinance | null }[]).find((item) => item.period === period);
    expect(row?.finance).toMatchObject({ result: 109, igv_payable: 9, net_after_igv: 100 });

    const detail = await admin().get(`/cash-closing/find/${period}`);
    expect(detail.body.data.finance).toMatchObject({ income: 218, expenses: 109, net_after_igv: 100 });
  });

  it("Estadísticas reparte ingresos y egresos por categoría y suma lo mismo que los KPIs", async () => {
    const res = await admin().get(`/statistics/overview?dateFrom=${today}&dateTo=${today}`);
    expect(res.status).toBe(200);
    const { cash_by_category: byCategory, kpis } = res.body.data as {
      cash_by_category: { income: CategoryAmount[]; expenses: CategoryAmount[] };
      kpis: { current: { collected: number; other_income: number; expenses: number } };
    };
    const amountOf = (items: CategoryAmount[], key: string) => items.find((item) => item.key === key)?.amount;
    expect(amountOf(byCategory.income, "client_payments")).toBe(118);
    expect(byCategory.income.find((item) => item.label === "Otro ingreso")?.amount).toBe(100);
    expect(amountOf(byCategory.expenses, "purchases")).toBe(59);
    expect(amountOf(byCategory.expenses, "quotation_expenses")).toBe(20);
    expect(byCategory.expenses.find((item) => item.label === "Otro egreso")?.amount).toBe(30);

    const sum = (items: CategoryAmount[]) => Math.round(items.reduce((total, item) => total + item.amount, 0) * 100) / 100;
    expect(sum(byCategory.income)).toBe(kpis.current.collected + kpis.current.other_income);
    expect(sum(byCategory.expenses)).toBe(kpis.current.expenses);
  });
});
