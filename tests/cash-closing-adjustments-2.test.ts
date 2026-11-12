import { activateInvitedUser, authedRequest, login, wordStamp } from "./helpers/apiClient";
import { CashClosingTestCompany, createCashClosingTestCompany, createUnscopedCompanyAdmin } from "./helpers/fixtures";
import { queryRows } from "./helpers/db";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const SETUP_TIMEOUT = 300_000;
const READY_PASSWORD = "Test1234";

// ---------------------------------------------------------------------------
// Fechas (día calendario de Lima), mismo esquema que cash-closing-adjustments:
// inicio de caja = hace dos meses (se cierra); el anterior y el actual
// abiertos; el de hace tres meses es pre-ledger.
// ---------------------------------------------------------------------------
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

const TODAY = limaToday();
const CURRENT_PERIOD = TODAY.slice(0, 7);
const CLOSED_PERIOD = shiftPeriod(CURRENT_PERIOD, -2);
const NEXT_PERIOD = shiftPeriod(CURRENT_PERIOD, -1);
const PRE_LEDGER_PERIOD = shiftPeriod(CURRENT_PERIOD, -3);
const CLOSED_START = `${CLOSED_PERIOD}-01`;
const CLOSED_END = lastDayOf(CLOSED_PERIOD);
const OPEN_START = `${NEXT_PERIOD}-01`;
const closedDay = (day: number): string => `${CLOSED_PERIOD}-${String(day).padStart(2, "0")}`;
const openDay = (day: number): string => `${NEXT_PERIOD}-${String(day).padStart(2, "0")}`;
const PRE_LEDGER_DAY = `${PRE_LEDGER_PERIOD}-15`;

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

interface LegRow {
  leg: "hold" | "posting";
  entry_date: string;
  direction: "income" | "expense";
  amount: string;
  payment_account_id: number | null;
  business_unit_id: number | null;
  affected_period: string;
  kind: string;
}

interface PeriodBalance {
  account_key: number;
  opening: number;
  income: number;
  expense: number;
  adjustments: number;
  closing: number;
}

interface RoleTreeNode {
  id: number;
  code: string;
  children: RoleTreeNode[];
}

const flattenResourceTree = (modules: { resources: RoleTreeNode[] }[]): RoleTreeNode[] => {
  const walk = (nodes: RoleTreeNode[]): RoleTreeNode[] => nodes.flatMap((node) => [node, ...walk(node.children)]);
  return modules.flatMap((module) => walk(module.resources));
};

const openingBody = (ctx: CashClosingTestCompany, startPeriod: string, cash = 500, bank = 1000) => ({
  start_period: startPeriod,
  openings: [
    { payment_account_id: null, amount: cash },
    { payment_account_id: ctx.bankAccountId, amount: bank },
    { payment_account_id: ctx.yapeAccountId, amount: 0 },
  ],
  notes: "Saldo inicial de prueba",
});

/**
 * Cierre de caja (2): segunda tanda de pruebas de ajustes (M3). Empresas
 * DESECHABLES (los cierres no se borran). Un solo login por usuario (un
 * segundo login invalida el token anterior).
 */

// ---------------------------------------------------------------------------
// Helpers ligados a una empresa de prueba.
// ---------------------------------------------------------------------------
const bind = (getCtx: () => CashClosingTestCompany) => {
  const api = () => authedRequest(getCtx().admin.token);

  const cashSummary = async (query: string): Promise<CashSummary> => {
    const res = await api().get(`/cash-movement/list?limit=1${query}`);
    expect(res.status).toBe(200);
    return res.body.data.summary as CashSummary;
  };

  const createQuotation = async (): Promise<number> => {
    const ctx = getCtx();
    const stamp = wordStamp();
    const client = await api().post("/client/create", { company_id: ctx.companyId, name: `CierreDosCliente${stamp}` });
    const product = await api().post("/product/create", {
      company_id: ctx.companyId,
      name: `CierreDosProducto${stamp}`,
      price_unit: 20,
      requires_customization: true,
    });
    const technique = await api().post("/customization-technique/create", {
      company_id: ctx.companyId,
      name: `CierreDosTecnica${stamp}`,
      price_unit: 5,
    });
    const quotation = await api().post("/quotation/create", {
      company_id: ctx.companyId,
      client_id: client.body.data.id,
      business_unit_id: null,
      items: [{ product_id: product.body.data.id, technique_id: technique.body.data.id, quantity: 10, pricing_mode: "unit" }],
    });
    expect([200, 201]).toContain(quotation.status);
    const quotationId: number = quotation.body.data.id;
    expect((await api().put(`/quotation/status/${quotationId}`, { status: "accepted" })).status).toBe(200);
    return quotationId;
  };

  const createMovement = async (body: Record<string, unknown>): Promise<number> => {
    const res = await api().post("/cash-movement/create", {
      direction: "income",
      category: "otro_ingreso",
      amount: 100,
      description: `Cierre2 ${wordStamp().slice(0, 6)}`,
      occurred_at: closedDay(5),
      payment_account_id: getCtx().bankAccountId,
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body.data.id as number;
  };

  const createPayment = async (quotationId: number, body: Record<string, unknown> = {}): Promise<number> => {
    const res = await api().post(`/quotation/${quotationId}/payments`, {
      amount: 100,
      method: "transfer",
      operation_number: "OP-CIERRE2",
      paid_at: closedDay(10),
      payment_account_id: getCtx().bankAccountId,
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body.data.id as number;
  };

  const paymentBody = (overrides: Record<string, unknown>) => ({
    amount: 100,
    method: "transfer",
    operation_number: "OP-CIERRE2",
    paid_at: closedDay(10),
    payment_account_id: getCtx().bankAccountId,
    notes: null,
    reason: "Corrección de un pago de mes cerrado",
    ...overrides,
  });

  const legsOf = (source: string, sourceId: number) =>
    queryRows<LegRow>(
      `SELECT e.leg, DATE_FORMAT(e.entry_date, '%Y-%m-%d') AS entry_date, e.direction, e.amount,
              e.payment_account_id, e.business_unit_id, e.affected_period, mc.kind
       FROM cash_adjustment_entry e
       INNER JOIN money_correction mc ON mc.id = e.money_correction_id
       WHERE e.source_type = ? AND e.source_id = ?
       ORDER BY e.id`,
      [source, sourceId]
    );

  const postingSum = async (source: string, sourceId: number): Promise<number> => {
    const [row] = await queryRows<{ total: string | null }>(
      "SELECT SUM(amount) AS total FROM cash_adjustment_entry WHERE source_type = ? AND source_id = ? AND leg = 'posting'",
      [source, sourceId]
    );
    return money(row?.total);
  };

  const storedBalances = (period: string) =>
    queryRows<{ account_key: number; opening: string; income: string; expense: string; adjustments: string; closing: string }>(
      `SELECT b.account_key, b.opening, b.income, b.expense, b.adjustments, b.closing
       FROM cash_period_balance b INNER JOIN cash_period p ON p.id = b.cash_period_id
       WHERE p.company_id = ? AND p.period = ? AND p.status = 'closed'`,
      [getCtx().companyId, period]
    );

  // I1: Caja del mes cerrado (toda la empresa) = foto guardada del cierre.
  const expectPeriodIntact = async (period: string) => {
    const stored = await storedBalances(period);
    expect(stored.length).toBeGreaterThan(0);
    const summary = await cashSummary(`&dateFrom=${period}-01&dateTo=${lastDayOf(period)}`);
    const live = new Map(summary.by_account.map((row) => [row.payment_account_id ?? 0, row]));
    for (const row of stored) {
      const current = live.get(Number(row.account_key));
      expect([Number(row.account_key), money(current?.income), money(current?.expense), money(current?.adjustments)]).toEqual([
        Number(row.account_key),
        money(row.income),
        money(row.expense),
        money(row.adjustments),
      ]);
    }
    const storedKeys = new Set(stored.map((row) => Number(row.account_key)));
    const extra = summary.by_account.filter(
      (row) => !storedKeys.has(row.payment_account_id ?? 0) && (money(row.income) !== 0 || money(row.expense) !== 0)
    );
    expect(extra).toEqual([]);
  };

  // I3: hold + posting = 0 por ajuste.
  const expectAdjustmentsBalanced = async () => {
    const unbalanced = await queryRows<{ money_correction_id: number }>(
      `SELECT e.money_correction_id FROM cash_adjustment_entry e WHERE e.company_id = ?
       GROUP BY e.money_correction_id, e.direction, COALESCE(e.payment_account_id, 0), COALESCE(e.business_unit_id, 0),
                COALESCE(e.quotation_id, 0), COALESCE(e.purchase_order_id, 0)
       HAVING ABS(SUM(e.amount)) > 0.001`,
      [getCtx().companyId]
    );
    expect(unbalanced).toEqual([]);
  };

  const view = async (quotationId: number) => ({
    open: await cashSummary(`&quotationId=${quotationId}&dateFrom=${OPEN_START}&dateTo=${TODAY}`),
    closed: await cashSummary(`&quotationId=${quotationId}&dateFrom=${CLOSED_START}&dateTo=${CLOSED_END}`),
    all: await cashSummary(`&quotationId=${quotationId}&dateFrom=${CLOSED_START}&dateTo=${TODAY}`),
  });

  const accountOf = (summary: CashSummary, accountId: number | null) =>
    summary.by_account.find((row) => row.payment_account_id === accountId);

  const periodDetail = async (period: string): Promise<PeriodBalance[]> => {
    const res = await api().get(`/cash-closing/find/${period}`);
    expect(res.status).toBe(200);
    return res.body.data.balances as PeriodBalance[];
  };

  return {
    api, cashSummary, createQuotation, createMovement, createPayment, paymentBody, legsOf, postingSum,
    storedBalances, expectPeriodIntact, expectAdjustmentsBalanced, view, accountOf, periodDetail,
  };
};

// =============================================================================
// Empresa A: mes cerrado + escenarios de ajuste (a–e, g).
// =============================================================================
describe("Cierre de caja (2): ajustes, permisos y ciclo de reapertura", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let limitedToken: string;
  let storeBId: number;
  let reimbursementWorkerId: number;
  const h = bind(() => ctx);
  const admin = () => h.api();
  const limited = () => authedRequest(limitedToken);

  const data = {
    forbiddenQuotation: 0,
    forbiddenAmount: 0,
    forbiddenDescription: 0,
    accountManualQuotation: 0,
    accountManual: 0,
    accountPaymentQuotation: 0,
    accountPayment: 0,
    restoreQuotation: 0,
    restoreRow: 0,
    debtStoreA: 0,
    debtStoreB: 0,
    reimbursement: 0,
    cyclePaymentQuotation: 0,
    cyclePayment: 0,
    cycleManualQuotation: 0,
    cycleManual: 0,
    preLedgerQuotation: 0,
    preLedgerRow: 0,
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    const superApi = authedRequest(superToken);

    const storeB = await superApi.post("/business-unit/create", {
      company_id: ctx.companyId,
      business_code: `QB-${wordStamp().slice(0, 6)}`,
    });
    expect(storeB.status).toBe(201);
    storeBId = storeB.body.data.id;
    reimbursementWorkerId = (await createUnscopedCompanyAdmin(superToken, ctx.companyId)).userId;

    // Rol con corrección de movimientos manuales pero SIN cash_closing.adjust.button.
    const role = await superApi.post("/role/create", {
      name: `NoAdjust${wordStamp().slice(0, 8)}`,
      description: "Corrige movimientos pero no ajusta meses cerrados",
      company_id: ctx.companyId,
    });
    expect(role.status).toBe(200);
    const roleId: number = role.body.data.id;
    const tree = await superApi.get("/roles/1/resources");
    const nodes = flattenResourceTree(tree.body.data.modules);
    const wanted = [
      "cash_movement.list.endpoint",
      "cash_movement.update.button",
      "cash_movement.disable.button",
      "cash_movement.corrections.button",
    ].map((code) => nodes.find((node) => node.code === code)?.id);
    expect(wanted.every((id) => id !== undefined)).toBe(true);
    const saved = await superApi.put(`/roles/${roleId}/resources`, { resourceIds: { add: wanted, remove: [] } });
    expect(saved.status).toBe(200);

    // Usuario de empresa SIN tienda con ese rol.
    const email = `noadjust.${wordStamp()}@acme.test`;
    const createdUser = await superApi.post("/user/create", {
      name: "NoAdjust",
      paternal_lastname: "Corrector",
      document_type: 1,
      document_number: `${Date.now()}`.slice(-8),
      date_of_birth: "01/01/1990",
      email,
      status: true,
      gender: 4,
      company_id: ctx.companyId,
      roleIds: roleId,
    });
    expect(createdUser.status).toBe(200);
    limitedToken = (await activateInvitedUser(createdUser.body, email, READY_PASSWORD)).token;

    expect((await admin().put("/cash-closing/opening", openingBody(ctx, CLOSED_PERIOD))).status).toBe(200);

    // Filas del mes a cerrar (todavía abierto).
    data.forbiddenQuotation = await h.createQuotation();
    data.forbiddenAmount = await h.createMovement({ quotation_id: data.forbiddenQuotation, occurred_at: closedDay(4) });
    data.forbiddenDescription = await h.createMovement({ direction: "expense", category: "otro_egreso", amount: 40, payment_account_id: null, occurred_at: closedDay(4) });

    data.accountManualQuotation = await h.createQuotation();
    data.accountManual = await h.createMovement({ quotation_id: data.accountManualQuotation, occurred_at: closedDay(6) });
    data.accountPaymentQuotation = await h.createQuotation();
    data.accountPayment = await h.createPayment(data.accountPaymentQuotation, { paid_at: closedDay(8) });

    // Egreso anulado ANTES del cierre (en mes abierto no pide motivo).
    data.restoreQuotation = await h.createQuotation();
    data.restoreRow = await h.createMovement({
      direction: "expense",
      category: "otro_egreso",
      amount: 30,
      payment_account_id: null,
      quotation_id: data.restoreQuotation,
      occurred_at: closedDay(9),
    });
    expect((await admin().put(`/cash-movement/disable/${data.restoreRow}`)).status).toBe(200);

    // Reposición que cubre deudas de dos tiendas, llevada al mes a cerrar.
    const manualDebt = async (businessUnitId: number, amount: number) => {
      const res = await admin().post("/employee-debt/create", {
        user_id: reimbursementWorkerId,
        description: `Deuda cierre2 ${wordStamp().slice(0, 6)}`,
        category: "pago_servicios",
        amount,
        incurred_at: closedDay(3),
        business_unit_id: businessUnitId,
      });
      expect(res.status).toBe(201);
      return res.body.data.id as number;
    };
    data.debtStoreA = await manualDebt(ctx.storeId, 100);
    data.debtStoreB = await manualDebt(storeBId, 50);
    const paid = await admin().put(`/employee-debt/pay/${reimbursementWorkerId}`, { amount: 150, payment_account_id: ctx.bankAccountId });
    expect(paid.status).toBe(200);
    data.reimbursement = paid.body.data.id;
    const moved = await admin().put(`/employee-debt/payment/update/${data.reimbursement}`, {
      paid_at: closedDay(20),
      reason: "Fecha real de la reposición",
    });
    expect(moved.status).toBe(200);

    data.cyclePaymentQuotation = await h.createQuotation();
    data.cyclePayment = await h.createPayment(data.cyclePaymentQuotation, { amount: 70, paid_at: closedDay(12) });
    data.cycleManualQuotation = await h.createQuotation();
    data.cycleManual = await h.createMovement({ quotation_id: data.cycleManualQuotation, occurred_at: closedDay(13) });
    data.preLedgerQuotation = await h.createQuotation();
    data.preLedgerRow = await h.createMovement({ quotation_id: data.preLedgerQuotation, occurred_at: closedDay(14) });

    const closed = await admin().put(`/cash-closing/close/${CLOSED_PERIOD}`, { notes: "Cierre de prueba" });
    expect(closed.status).toBe(200);
  }, SETUP_TIMEOUT);

  afterEach(async () => {
    await h.expectPeriodIntact(CLOSED_PERIOD);
    await h.expectAdjustmentsBalanced();
  });

  // =========================================================================
  // (a) permiso de ajustar
  // =========================================================================
  it("(a) sin cash_closing.adjust.button: cambiar el monto de un mes cerrado → 403; solo la descripción → 200", async () => {
    const res = await limited().put(`/cash-movement/update/${data.forbiddenAmount}`, {
      amount: 80,
      reason: "Intento de corregir el monto",
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CASH_PERIOD_ADJUST_FORBIDDEN");
    expect(await h.legsOf("manual", data.forbiddenAmount)).toEqual([]);
    const unchanged = await h.view(data.forbiddenQuotation);
    expect(money(unchanged.closed.income)).toBe(100);
    expect(money(unchanged.all.net)).toBe(100);

    // Anular tampoco (es un efecto en caja de un mes cerrado).
    const annul = await limited().put(`/cash-movement/disable/${data.forbiddenAmount}`, { reason: "Intento de anular" });
    expect(annul.status).toBe(403);
    expect(annul.body.code).toBe("CASH_PERIOD_ADJUST_FORBIDDEN");

    const description = await limited().put(`/cash-movement/update/${data.forbiddenDescription}`, {
      description: "Solo cambia el texto",
      reason: "Aclarar la descripción",
    });
    expect(description.status).toBe(200);
    expect(description.body.data.kind).toBe("correction");
    expect(await h.legsOf("manual", data.forbiddenDescription)).toEqual([]);
  });

  // =========================================================================
  // (b) cambio de cuenta
  // =========================================================================
  it("(b) cambiar de cuenta un movimiento manual de un mes cerrado: −X en la vieja, +X en la nueva, neto 0", async () => {
    const res = await admin().put(`/cash-movement/update/${data.accountManual}`, {
      payment_account_id: ctx.yapeAccountId,
      reason: "Entró por Yape, no por el banco",
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ kind: "adjustment", adjusted_period: CLOSED_PERIOD });

    const v = await h.view(data.accountManualQuotation);
    expect(money(h.accountOf(v.open, ctx.bankAccountId)?.adjustments)).toBe(-100);
    expect(money(h.accountOf(v.open, ctx.yapeAccountId)?.adjustments)).toBe(100);
    expect(money(v.open.adjustments)).toBe(0);
    expect(money(v.all.net)).toBe(100);
  });

  it("(b) cambiar de cuenta un pago de un mes cerrado: −X en la vieja, +X en la nueva, neto 0", async () => {
    const res = await admin().put(
      `/payment/update/${data.accountPayment}`,
      h.paymentBody({ paid_at: closedDay(8), payment_account_id: ctx.yapeAccountId })
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ kind: "adjustment", adjusted_period: CLOSED_PERIOD });

    const v = await h.view(data.accountPaymentQuotation);
    expect(money(h.accountOf(v.open, ctx.bankAccountId)?.adjustments)).toBe(-100);
    expect(money(h.accountOf(v.open, ctx.yapeAccountId)?.adjustments)).toBe(100);
    expect(money(v.open.adjustments)).toBe(0);
    expect(money(v.all.net)).toBe(100);
  });

  // =========================================================================
  // (c) restaurar una fila anulada antes del cierre
  // =========================================================================
  it("(c) restaurar en un mes cerrado una fila anulada antes del cierre → ajuste hoy; el mes cerrado no cambia", async () => {
    const before = await h.view(data.restoreQuotation);
    expect(money(before.all.net)).toBe(0);

    const noReason = await admin().put(`/cash-movement/disable/${data.restoreRow}`);
    expect(noReason.status).toBe(400);
    expect(noReason.body.code).toBe("ADJUSTMENT_REASON_REQUIRED");

    const restored = await admin().put(`/cash-movement/disable/${data.restoreRow}`, { reason: "Sí era un gasto válido" });
    expect(restored.status).toBe(200);
    expect(restored.body.data).toMatchObject({ is_deleted: false, kind: "adjustment", adjusted_period: CLOSED_PERIOD });

    const legs = await h.legsOf("manual", data.restoreRow);
    const posting = legs.filter((leg) => leg.leg === "posting");
    expect(posting.map((leg) => [leg.entry_date, leg.direction, money(leg.amount)])).toEqual([[TODAY, "expense", 30]]);
    const v = await h.view(data.restoreQuotation);
    expect(money(v.open.adjustments)).toBe(-30);
    expect(money(v.all.net)).toBe(-30);
  });

  // =========================================================================
  // (d) anular una reposición de un mes cerrado
  // =========================================================================
  it("(d) anular con motivo una reposición de un mes cerrado → patas por tienda; deudas recalculadas", async () => {
    const noReason = await admin().put(`/employee-debt/payment/disable/${data.reimbursement}`);
    expect(noReason.status).toBe(400);
    expect(noReason.body.code).toBe("ADJUSTMENT_REASON_REQUIRED");

    const voided = await admin().put(`/employee-debt/payment/disable/${data.reimbursement}`, { reason: "Reposición registrada por error" });
    expect(voided.status).toBe(200);
    expect(voided.body.data).toMatchObject({ kind: "adjustment", adjusted_period: CLOSED_PERIOD });

    const legs = await h.legsOf("employee_debt_payment", data.reimbursement);
    const postingByStore = new Map<number | null, number>();
    for (const leg of legs.filter((row) => row.leg === "posting")) {
      postingByStore.set(leg.business_unit_id, money((postingByStore.get(leg.business_unit_id) ?? 0) + Number(leg.amount)));
    }
    // Se anulan 100 (tienda A) y 50 (tienda B) de egreso: las patas posting son −100 y −50.
    expect(postingByStore.get(ctx.storeId)).toBe(-100);
    expect(postingByStore.get(storeBId)).toBe(-50);
    expect(legs.every((leg) => leg.direction === "expense" && leg.kind === "adjustment")).toBe(true);

    const debts = await queryRows<{ id: number; paid_amount: string; status: string }>(
      "SELECT id, paid_amount, status FROM employee_debt WHERE id IN (?, ?)",
      [data.debtStoreA, data.debtStoreB]
    );
    for (const debt of debts) {
      expect(money(debt.paid_amount)).toBe(0);
      expect(debt.status).toBe("pending");
    }
  });

  // =========================================================================
  // (g) mover la fecha de una fila de un mes cerrado a una fecha pre-ledger
  // =========================================================================
  it("(g) mover una fila de un mes cerrado a una fecha anterior al inicio de la caja → ajuste (sale del libro)", async () => {
    // cashPeriod.ts: solo bloquea (409 CASH_PERIOD_CLOSED) si la fecha nueva cae en un
    // mes CERRADO; una fecha pre-ledger no es "cerrada", así que se permite y el efecto
    // que tenía en el mes cerrado se compensa con patas (hold en la fecha original, posting hoy).
    const res = await admin().put(`/cash-movement/update/${data.preLedgerRow}`, {
      occurred_at: PRE_LEDGER_DAY,
      reason: "En realidad era de antes de usar la caja",
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ kind: "adjustment", adjusted_period: CLOSED_PERIOD });

    const legs = await h.legsOf("manual", data.preLedgerRow);
    const hold = legs.filter((leg) => leg.leg === "hold");
    const posting = legs.filter((leg) => leg.leg === "posting");
    expect(hold.map((leg) => [leg.entry_date, leg.direction, money(leg.amount)])).toEqual([[closedDay(14), "income", 100]]);
    expect(posting.map((leg) => [leg.entry_date, leg.direction, money(leg.amount)])).toEqual([[TODAY, "income", -100]]);
    const v = await h.view(data.preLedgerQuotation);
    expect(money(v.open.adjustments)).toBe(-100);
  });

  // =========================================================================
  // (e) ciclo de reapertura (M1)
  // =========================================================================
  it("(e-i) anular un pago cerrado, reabrir el mes, restaurarlo y re-cerrar → sin doble conteo", async () => {
    const quotationId = data.cyclePaymentQuotation;
    const baseline = await h.cashSummary(`&dateFrom=${CLOSED_START}&dateTo=${CLOSED_END}`);

    const annulled = await admin().put(`/payment/disable/${data.cyclePayment}`, { reason: "Pago duplicado" });
    expect(annulled.status).toBe(200);
    expect(money((await h.view(quotationId)).all.net)).toBe(0);

    const reopened = await admin().put(`/cash-closing/reopen/${CLOSED_PERIOD}`, { reason: "Se restaura el pago anulado" });
    expect(reopened.status).toBe(200);
    const restored = await admin().put(`/payment/disable/${data.cyclePayment}`, { reason: "No era duplicado" });
    expect(restored.status).toBe(200);
    const closed = await admin().put(`/cash-closing/close/${CLOSED_PERIOD}`, { notes: "Re-cierre" });
    expect(closed.status).toBe(200);

    // El mes vuelve a mostrar el valor original y los ajustes de la fila netean 0.
    const v = await h.view(quotationId);
    expect(money(v.closed.income)).toBe(70);
    expect(money(v.open.adjustments)).toBe(0);
    expect(money(v.all.net)).toBe(70);
    expect(await h.postingSum("quotation_payment", data.cyclePayment)).toBe(0);
    const after = await h.cashSummary(`&dateFrom=${CLOSED_START}&dateTo=${CLOSED_END}`);
    const bankBefore = h.accountOf(baseline, ctx.bankAccountId);
    const bankAfter = h.accountOf(after, ctx.bankAccountId);
    expect(money(bankAfter?.income)).toBe(money(bankBefore?.income));
    expect(money(bankAfter?.adjustments)).toBe(money(bankBefore?.adjustments));
  });

  it("(e-ii) corregir 100→80 en un mes cerrado, reabrir, corregir a 90 y re-cerrar → el mes muestra 90", async () => {
    const quotationId = data.cycleManualQuotation;
    const first = await admin().put(`/cash-movement/update/${data.cycleManual}`, { amount: 80, reason: "El ingreso real fue de 80" });
    expect(first.status).toBe(200);
    expect(first.body.data.kind).toBe("adjustment");
    expect(money((await h.view(quotationId)).all.net)).toBe(80);

    expect((await admin().put(`/cash-closing/reopen/${CLOSED_PERIOD}`, { reason: "Se corrige el monto otra vez" })).status).toBe(200);
    const second = await admin().put(`/cash-movement/update/${data.cycleManual}`, { amount: 90, reason: "Ahora son 90" });
    expect(second.status).toBe(200);
    expect((await admin().put(`/cash-closing/close/${CLOSED_PERIOD}`, { notes: "Re-cierre" })).status).toBe(200);

    const v = await h.view(quotationId);
    expect(money(v.closed.income)).toBe(90);
    expect(money(v.all.net)).toBe(90);
    // Los ajustes del mes reabierto se liberaron: el mes ya refleja la fila viva.
    expect(money(v.open.adjustments)).toBe(0);
    expect(await h.postingSum("manual", data.cycleManual)).toBe(0);
  });
});

// =============================================================================
// Empresa B: saldo inicial con inicio reabierto (f) y concurrencia (h).
// =============================================================================
describe("Cierre de caja (2): saldo inicial reabierto y concurrencia", () => {
  let ctx: CashClosingTestCompany;
  let concurrentQuotation: number;
  let concurrentRow: number;
  let nextIncomeRow: number;
  const h = bind(() => ctx);
  const admin = () => h.api();

  beforeAll(async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    expect((await admin().put("/cash-closing/opening", openingBody(ctx, CLOSED_PERIOD))).status).toBe(200);
    concurrentQuotation = await h.createQuotation();
    concurrentRow = await h.createMovement({ quotation_id: concurrentQuotation, occurred_at: closedDay(5) });
    nextIncomeRow = await h.createMovement({ amount: 40, occurred_at: openDay(3) });
    expect(nextIncomeRow).toBeGreaterThan(0);
  }, SETUP_TIMEOUT);

  it("(h) cerrar el mes y corregir una fila de ese mes a la vez → I1 se cumple en cualquier orden", async () => {
    const [closeRes, correctRes] = await Promise.all([
      admin().put(`/cash-closing/close/${CLOSED_PERIOD}`, { notes: "Cierre concurrente" }),
      admin().put(`/cash-movement/update/${concurrentRow}`, { amount: 80, reason: "Corrección concurrente al cierre" }),
    ]);
    expect([200, 409]).toContain(closeRes.status);
    expect([200, 409]).toContain(correctRes.status);

    // Si el cierre perdió la carrera, se reintenta (el mes sigue abierto).
    if (closeRes.status === 409) {
      const retry = await admin().put(`/cash-closing/close/${CLOSED_PERIOD}`, { notes: "Reintento" });
      expect(retry.status).toBe(200);
    }
    await h.expectPeriodIntact(CLOSED_PERIOD);
    await h.expectAdjustmentsBalanced();

    const stored = (await h.storedBalances(CLOSED_PERIOD)).find((row) => Number(row.account_key) === ctx.bankAccountId);
    const legs = await h.legsOf("manual", concurrentRow);
    const correctedBeforeClose = money(stored?.income) === 80;
    if (correctRes.status === 409) {
      // La corrección no se aplicó: la fila sigue en 100 y no hay patas.
      expect(money(stored?.income)).toBe(100);
      expect(legs).toEqual([]);
      return;
    }
    // Aplicada antes del cierre → la foto la incluye y no hay patas; después → foto en 100 con patas.
    expect(correctedBeforeClose ? legs.length : legs.length > 0).toBe(correctedBeforeClose ? 0 : true);
    expect(money(stored?.income)).toBe(correctedBeforeClose ? 80 : 100);
    expect(money((await h.view(concurrentQuotation)).all.net)).toBe(80);
  });

  it("(f) editar el saldo inicial con el mes de inicio reabierto y re-cerrar recalcula los meses posteriores", async () => {
    expect((await admin().put(`/cash-closing/close/${NEXT_PERIOD}`, { notes: "Cierre siguiente" })).status).toBe(200);
    const nextBefore = await h.periodDetail(NEXT_PERIOD);
    const closedBefore = await h.periodDetail(CLOSED_PERIOD);
    const bankKey = ctx.bankAccountId;
    const bankClosedBefore = closedBefore.find((row) => row.account_key === bankKey);
    const bankNextBefore = nextBefore.find((row) => row.account_key === bankKey);
    expect(money(bankNextBefore?.opening)).toBe(money(bankClosedBefore?.closing));

    // Con el inicio cerrado el saldo inicial está bloqueado.
    const locked = await admin().put("/cash-closing/opening", openingBody(ctx, CLOSED_PERIOD, 500, 1200));
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe("CASH_OPENING_LOCKED");

    expect((await admin().put(`/cash-closing/reopen/${CLOSED_PERIOD}`, { reason: "Corregir el saldo inicial" })).status).toBe(200);
    const edited = await admin().put("/cash-closing/opening", openingBody(ctx, CLOSED_PERIOD, 500, 1200));
    expect(edited.status).toBe(200);
    expect((await admin().put(`/cash-closing/close/${CLOSED_PERIOD}`, { notes: "Re-cierre con nuevo saldo" })).status).toBe(200);

    const closedAfter = await h.periodDetail(CLOSED_PERIOD);
    const nextAfter = await h.periodDetail(NEXT_PERIOD);
    const bankClosedAfter = closedAfter.find((row) => row.account_key === bankKey);
    const bankNextAfter = nextAfter.find((row) => row.account_key === bankKey);
    expect(money(bankClosedAfter?.opening)).toBe(1200);
    expect(money(bankClosedAfter?.closing)).toBe(money(bankClosedBefore?.closing) + 200);
    // Cadena: apertura del mes siguiente = cierre del anterior; su flujo no cambia.
    expect(money(bankNextAfter?.opening)).toBe(money(bankClosedAfter?.closing));
    expect(money(bankNextAfter?.closing)).toBe(money(bankNextBefore?.closing) + 200);
    for (const after of nextAfter) {
      const before = nextBefore.find((row) => row.account_key === after.account_key);
      expect([after.account_key, money(after.income), money(after.expense), money(after.adjustments)]).toEqual([
        after.account_key,
        money(before?.income),
        money(before?.expense),
        money(before?.adjustments),
      ]);
    }
    await h.expectPeriodIntact(CLOSED_PERIOD);
    await h.expectPeriodIntact(NEXT_PERIOD);
  });
});
