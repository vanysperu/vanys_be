import { authedRequest, login } from "./helpers/apiClient";
import { CashClosingTestCompany, createCashClosingTestCompany, createQuotationFixture } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const SETUP_TIMEOUT = 300_000;

const limaToday = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

const shiftPeriod = (period: string, months: number): string => {
  const [year = 0, month = 1] = period.split("-").map(Number);
  const index = year * 12 + (month - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
};

const lastDayOf = (period: string): string => {
  const [year = 0, month = 1] = period.split("-").map(Number);
  return `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
};

// P = mes anterior (se cierra y es el inicio de la caja); CUR = mes actual.
const TODAY = limaToday();
const CUR = TODAY.slice(0, 7);
const P = shiftPeriod(CUR, -1);
const P_START = `${P}-01`;
const P_END = lastDayOf(P);
const CUR_START = `${CUR}-01`;
const pDay = (value: number): string => `${P}-${String(value).padStart(2, "0")}`;

const money = (value: unknown): number => Math.round(Number(value ?? 0) * 100) / 100;

interface AccountSummary {
  payment_account_id: number | null;
  income: number;
  expense: number;
  adjustments: number;
  net: number;
}

interface CashSummary {
  income: number;
  expense: number;
  adjustments: number;
  net: number;
  by_account: AccountSummary[];
}

interface CashItem {
  entry_kind: "movement" | "closing_hold" | "adjustment";
  period_status: string;
  source: string;
  amount: number;
  adjustment: { affected_period: string; posted_date: string; reason: string; action: string } | null;
}

interface CashList {
  data: CashItem[];
  summary: CashSummary;
  cash_period: { closed_periods: string[] } | null;
}

interface Kpis {
  collected: number;
  other_income: number;
  expenses: number;
  adjustments: number;
  net_cash: number;
}

interface Overview {
  kpis: { current: Kpis };
  trend: { bucket: string; income: number; expenses: number; adjustments: number }[];
  payments_by_account: { label: string; amount: number; count: number }[];
}

/**
 * Cierre de caja — REPORTES (plan §3.2, WP-A): Caja (resumen y por cuenta,
 * filtrada por tienda, cotización y fuente) y Estadísticas (kpis, tendencia,
 * cobros por cuenta) con patas de ajuste.
 *
 * Empresa DESECHABLE. Escenario (mes P cerrado, mes actual abierto):
 *   - pago A: S/ 100, banco, P-10 (cotización Q, sin tienda);
 *   - ingreso manual M: S/ 40, efectivo, tienda S, P-12;
 *   - egreso manual E: S/ 25, Yape, tienda S, P-14.
 * Se cierra P y HOY se corrige A a 70, M a 55 y se anula E.
 *   Ajustes de hoy: banco −30, efectivo +15, Yape +25 → +10.
 */
describe("Cierre de caja: Caja y Estadísticas con ajustes", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let quotationId: number;
  let paymentId: number;
  let incomeId: number;
  let expenseId: number;

  const admin = () => authedRequest(ctx.admin.token);
  const gestor = () => authedRequest(ctx.gestor.token);

  const cashList = async (query: string, as = admin): Promise<CashList> => {
    const res = await as().get(`/cash-movement/list?limit=100${query}`);
    expect(res.status).toBe(200);
    return res.body.data as CashList;
  };
  const summaryOf = async (query: string, as = admin) => (await cashList(query, as)).summary;
  const overview = async (from: string, to: string, extra = ""): Promise<Overview> => {
    const res = await admin().get(`/statistics/overview?dateFrom=${from}&dateTo=${to}${extra}`);
    expect(res.status).toBe(200);
    return res.body.data as Overview;
  };
  const accountOf = (summary: CashSummary, accountId: number | null) =>
    summary.by_account.find((row) => row.payment_account_id === accountId);

  const P_RANGE = `&dateFrom=${P_START}&dateTo=${P_END}`;
  const CUR_RANGE = `&dateFrom=${CUR_START}&dateTo=${TODAY}`;

  // Fotos ANTES de corregir (mes P ya cerrado).
  let pSummary: CashSummary;
  let pManual: CashSummary;
  let pQuotation: CashSummary;
  let pStore: CashSummary;
  let pOverview: Overview;
  let pStoreKpis: Kpis;

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    quotationId = (await createQuotationFixture(ctx.admin.token, ctx.companyId)).quotationId;

    const payment = await admin().post(`/quotation/${quotationId}/payments`, {
      amount: 100,
      method: "transfer",
      operation_number: "OP-REP",
      paid_at: pDay(10),
      payment_account_id: ctx.bankAccountId,
    });
    expect(payment.status).toBe(201);
    paymentId = payment.body.data.id;

    const movement = async (body: Record<string, unknown>) => {
      const res = await admin().post("/cash-movement/create", { business_unit_id: ctx.storeId, ...body });
      expect(res.status).toBe(201);
      return res.body.data.id as number;
    };
    incomeId = await movement({ direction: "income", category: "otro_ingreso", amount: 40, occurred_at: pDay(12) });
    expenseId = await movement({
      direction: "expense",
      category: "otro_egreso",
      amount: 25,
      occurred_at: pDay(14),
      payment_account_id: ctx.yapeAccountId,
    });

    const opening = await admin().put("/cash-closing/opening", {
      start_period: P,
      openings: [{ payment_account_id: null, amount: 0 }],
    });
    expect(opening.status).toBe(200);
    const close = await admin().put(`/cash-closing/close/${P}`, {});
    expect(close.status).toBe(200);

    pSummary = await summaryOf(P_RANGE);
    pManual = await summaryOf(`${P_RANGE}&source=manual`);
    pQuotation = await summaryOf(`${P_RANGE}&quotationId=${quotationId}`);
    pStore = await summaryOf(P_RANGE, gestor);
    pOverview = await overview(P_START, P_END);
    pStoreKpis = (await overview(P_START, P_END, `&businessUnitId=${ctx.storeId}`)).kpis.current;

    const reason = "Corrección después del cierre";
    const base = { method: "transfer", operation_number: "OP-REP", paid_at: pDay(10), payment_account_id: ctx.bankAccountId, notes: null };
    expect((await admin().put(`/payment/update/${paymentId}`, { ...base, amount: 70, reason })).status).toBe(200);
    expect((await admin().put(`/cash-movement/update/${incomeId}`, { amount: 55, reason })).status).toBe(200);
    expect((await admin().put(`/cash-movement/disable/${expenseId}`, { reason })).status).toBe(200);
  }, SETUP_TIMEOUT);

  it("sanity: el mes cerrado sumaba lo esperado", () => {
    expect(pSummary).toMatchObject({ income: 140, expense: 25, adjustments: 0, net: 115 });
    expect(pOverview.kpis.current).toMatchObject({ collected: 100, other_income: 40, expenses: 25, adjustments: 0, net_cash: 115 });
  });

  it("Caja del mes cerrado no cambia (resumen, por cuenta, por fuente, por cotización y por tienda)", async () => {
    expect(await summaryOf(P_RANGE)).toEqual(pSummary);
    expect(await summaryOf(`${P_RANGE}&source=manual`)).toEqual(pManual);
    expect(await summaryOf(`${P_RANGE}&quotationId=${quotationId}`)).toEqual(pQuotation);
    expect(await summaryOf(P_RANGE, gestor)).toEqual(pStore);
    expect(pStore).toMatchObject({ income: 40, expense: 25 });

    // Las filas "Valor al cierre" están en el mes cerrado, con candado.
    const list = await cashList(P_RANGE);
    const holds = list.data.filter((row) => row.entry_kind === "closing_hold");
    expect(holds.length).toBe(3);
    expect(holds.every((row) => row.period_status === "closed" && row.adjustment?.affected_period === P)).toBe(true);
    expect(holds.every((row) => row.adjustment?.posted_date === TODAY)).toBe(true);
    expect(list.cash_period?.closed_periods).toEqual([P]);
    expect(list.data.filter((row) => row.entry_kind === "movement").every((row) => row.period_status === "closed")).toBe(true);
  });

  it("Caja del mes abierto muestra la diferencia como ajustes (por cuenta, fuente, cotización y tienda)", async () => {
    const current = await summaryOf(CUR_RANGE);
    expect(current).toMatchObject({ income: 0, expense: 0, adjustments: 10, net: 10 });
    expect(accountOf(current, ctx.bankAccountId)).toMatchObject({ adjustments: -30, net: -30 });
    expect(accountOf(current, null)).toMatchObject({ adjustments: 15, net: 15 });
    expect(accountOf(current, ctx.yapeAccountId)).toMatchObject({ adjustments: 25, net: 25 });

    expect((await summaryOf(`${CUR_RANGE}&source=quotation_payment`)).adjustments).toBe(-30);
    expect((await summaryOf(`${CUR_RANGE}&source=manual`)).adjustments).toBe(40);
    expect((await summaryOf(`${CUR_RANGE}&quotationId=${quotationId}`)).adjustments).toBe(-30);
    expect((await summaryOf(CUR_RANGE, gestor)).adjustments).toBe(40);
    // Por categoría las patas no entran (limitación documentada).
    expect((await summaryOf(`${CUR_RANGE}&category=otro_ingreso`)).adjustments).toBe(0);

    const list = await cashList(CUR_RANGE);
    const postings = list.data.filter((row) => row.entry_kind === "adjustment");
    expect(postings.length).toBe(3);
    expect(postings.every((row) => row.period_status === "open" && row.adjustment?.affected_period === P)).toBe(true);
    expect(postings.find((row) => row.source === "manual" && row.adjustment?.action === "annul")).toBeDefined();

    // Un rango que cubre las dos patas muestra la verdad: 70 + 55 (E anulado).
    expect((await summaryOf(`&dateFrom=${P_START}&dateTo=${TODAY}`)).net).toBe(125);
  });

  it("Estadísticas del mes cerrado no cambian; el mes abierto muestra `adjustments`; net_cash = neto de Caja", async () => {
    const closed = await overview(P_START, P_END);
    expect(closed.kpis.current).toEqual(pOverview.kpis.current);
    expect(closed.trend).toEqual(pOverview.trend);
    expect(closed.payments_by_account).toEqual(pOverview.payments_by_account);
    expect(closed.kpis.current.net_cash).toBe(pSummary.net);
    expect((await overview(P_START, P_END, `&businessUnitId=${ctx.storeId}`)).kpis.current).toEqual(pStoreKpis);

    const open = await overview(CUR_START, TODAY);
    expect(open.kpis.current).toMatchObject({ collected: 0, other_income: 0, expenses: 0, adjustments: 10, net_cash: 10 });
    expect(money(open.trend.reduce((total, point) => total + point.adjustments, 0))).toBe(10);
    expect(open.trend.every((point) => typeof point.adjustments === "number")).toBe(true);
    expect(open.kpis.current.net_cash).toBe((await summaryOf(CUR_RANGE)).net);
  });
});
