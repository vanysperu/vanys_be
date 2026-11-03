import { authedRequest, login, wordStamp } from "./helpers/apiClient";
import {
  CashClosingTestCompany,
  createCashClosingTestCompany,
  createPurchaseOrderFixture,
  createUnscopedCompanyAdmin,
} from "./helpers/fixtures";
import { queryRows } from "./helpers/db";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const SETUP_TIMEOUT = 300_000;

// ---------------------------------------------------------------------------
// Fechas (día calendario de Lima). Mes de inicio de la caja = hace dos meses
// (se CIERRA); el mes anterior y el actual quedan abiertos; el de hace tres
// meses es "pre-ledger" (antes del inicio: sin candados ni ajustes).
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
const PREVIOUS_OPEN_PERIOD = shiftPeriod(CURRENT_PERIOD, -1);
const PRE_LEDGER_PERIOD = shiftPeriod(CURRENT_PERIOD, -3);
const CLOSED_START = `${CLOSED_PERIOD}-01`;
const CLOSED_END = lastDayOf(CLOSED_PERIOD);
const OPEN_START = `${PREVIOUS_OPEN_PERIOD}-01`;
const closedDay = (day: number): string => `${CLOSED_PERIOD}-${String(day).padStart(2, "0")}`;
const openDay = (day: number): string => `${PREVIOUS_OPEN_PERIOD}-${String(day).padStart(2, "0")}`;
const PRE_LEDGER_DAY = `${PRE_LEDGER_PERIOD}-15`;

const money = (value: unknown): number => Math.round(Number(value ?? 0) * 100) / 100;

// ---------------------------------------------------------------------------
// Tipos mínimos de lo que se lee.
// ---------------------------------------------------------------------------
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
  reason: string;
}

interface CorrectionRow {
  kind: string;
  reason: string;
  previous_values: string | Record<string, unknown>;
  new_values: string | Record<string, unknown>;
}

const parseJson = (value: string | Record<string, unknown>): Record<string, unknown> =>
  typeof value === "string" ? (JSON.parse(value) as Record<string, unknown>) : value;

/**
 * Cierre mensual de caja — cableado de AJUSTES en las 5 fuentes de Caja
 * (manual, pago, gasto, compra, reposición). Plan §3.4 / §7 WP-B.
 *
 * Empresa DESECHABLE (createCashClosingTestCompany): los cierres no se pueden
 * borrar, así que nunca se toca "Acme Corp QA".
 *
 * Setup: caja que empieza hace dos meses (saldo inicial declarado), filas con
 * fecha de ese mes registradas mientras estaba abierto, y luego se cierra.
 * Después de cada escenario se revisan los invariantes:
 *   - I1: Caja del mes cerrado (toda la empresa) = foto guardada del cierre;
 *   - I3: cada ajuste suma cero (hold + posting) por cuenta/tienda/cotización/OC;
 *   - Caja del rango abierto: summary.adjustments = Σ patas posting.
 */
describe("Cierre de caja: ajustes al corregir/anular filas de un mes cerrado", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let storeBId: number;
  let purchaseWorkerId: number;
  let reimbursementWorkerId: number;

  const admin = () => authedRequest(ctx.admin.token);
  const gestor = () => authedRequest(ctx.gestor.token);

  // ---------------- helpers de API ----------------
  const cashSummary = async (query: string): Promise<CashSummary> => {
    const res = await admin().get(`/cash-movement/list?limit=1${query}`);
    expect(res.status).toBe(200);
    return res.body.data.summary as CashSummary;
  };

  // Cotización aceptada (cliente + producto + técnica, 10 unidades) en la
  // tienda indicada (null = sin tienda).
  const createQuotation = async (businessUnitId: number | null = null, accept = true) => {
    const stamp = wordStamp();
    const client = await admin().post("/client/create", { company_id: ctx.companyId, name: `CierreCliente${stamp}` });
    const product = await admin().post("/product/create", {
      company_id: ctx.companyId,
      name: `CierreProducto${stamp}`,
      price_unit: 20,
      requires_customization: true,
    });
    const technique = await admin().post("/customization-technique/create", {
      company_id: ctx.companyId,
      name: `CierreTecnica${stamp}`,
      price_unit: 5,
    });
    const quotation = await admin().post("/quotation/create", {
      company_id: ctx.companyId,
      client_id: client.body.data.id,
      business_unit_id: businessUnitId,
      items: [{ product_id: product.body.data.id, technique_id: technique.body.data.id, quantity: 10, pricing_mode: "unit" }],
    });
    expect([200, 201]).toContain(quotation.status);
    const quotationId: number = quotation.body.data.id;
    if (accept) {
      const accepted = await admin().put(`/quotation/status/${quotationId}`, { status: "accepted" });
      expect(accepted.status).toBe(200);
    }
    const detail = await admin().get(`/quotation/find/${quotationId}`);
    return { quotationId, quotationItemId: detail.body.data.items[0].id as number };
  };

  const createMovement = async (body: Record<string, unknown>) => {
    const res = await admin().post("/cash-movement/create", {
      direction: "income",
      category: "otro_ingreso",
      amount: 100,
      description: `Cierre ${wordStamp().slice(0, 6)}`,
      occurred_at: closedDay(5),
      payment_account_id: ctx.bankAccountId,
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body.data.id as number;
  };

  const createPayment = async (quotationId: number, body: Record<string, unknown> = {}) => {
    const res = await admin().post(`/quotation/${quotationId}/payments`, {
      amount: 100,
      method: "transfer",
      operation_number: "OP-CIERRE",
      paid_at: closedDay(10),
      payment_account_id: ctx.bankAccountId,
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body.data.id as number;
  };

  const paymentBody = (overrides: Record<string, unknown>) => ({
    amount: 100,
    method: "transfer",
    operation_number: "OP-CIERRE",
    paid_at: closedDay(10),
    payment_account_id: ctx.bankAccountId,
    notes: null,
    reason: "Corrección de un pago de mes cerrado",
    ...overrides,
  });

  const createExpense = async (quotationId: number, body: Record<string, unknown> = {}) => {
    const res = await admin().post(`/quotation/${quotationId}/expenses`, {
      description: `Gasto cierre ${wordStamp().slice(0, 6)}`,
      amount: 100,
      spent_at: closedDay(15),
      payment_account_id: ctx.bankAccountId,
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body.data.id as number;
  };

  // Cotización + OC + una compra (hoy) que después se lleva al mes a cerrar.
  const createPurchase = async (body: Record<string, unknown>) => {
    const { quotationId, quotationItemId } = await createQuotation();
    const { purchaseOrderId, itemId } = await createPurchaseOrderFixture(
      ctx.admin.token,
      ctx.companyId,
      ctx.admin.userId,
      quotationId,
      quotationItemId
    );
    const res = await admin().post(`/purchase-order/item/${itemId}/purchases`, { quantity: 10, amount: 100, ...body });
    expect(res.status).toBe(201);
    const purchaseId = res.body.data.id as number;
    const found = await admin().get(`/purchase-order/purchase/find/${purchaseId}`);
    const expenseId = found.body.data.quotation_expense_id as number;
    const moved = await admin().put(`/purchase-order/purchase/update/${purchaseId}`, {
      spent_at: closedDay(12),
      reason: "Fecha real de la compra",
    });
    expect(moved.status).toBe(200);
    return { quotationId, purchaseOrderId, purchaseId, expenseId };
  };

  const totalPaid = async (quotationId: number) =>
    money((await admin().get(`/quotation/find/${quotationId}`)).body.data.total_paid);

  const receivableBalance = async (quotationId: number) => {
    const res = await admin().get("/receivable/list?limit=100&orderBy=created_at&orderDir=desc");
    expect(res.status).toBe(200);
    const row = (res.body.data.data as { quotation_id: number; balance: number }[]).find(
      (item) => item.quotation_id === quotationId
    );
    return row === undefined ? undefined : money(row.balance);
  };

  // ---------------- helpers de BD (solo lectura) ----------------
  const legsOf = (source: string, sourceId: number) =>
    queryRows<LegRow>(
      `SELECT e.leg, DATE_FORMAT(e.entry_date, '%Y-%m-%d') AS entry_date, e.direction, e.amount,
              e.payment_account_id, e.business_unit_id, e.affected_period, mc.kind, mc.reason
       FROM cash_adjustment_entry e
       INNER JOIN money_correction mc ON mc.id = e.money_correction_id
       WHERE e.source_type = ? AND e.source_id = ?
       ORDER BY e.id`,
      [source, sourceId]
    );

  const correctionsOf = (source: string, sourceId: number) =>
    queryRows<CorrectionRow>(
      `SELECT kind, reason, previous_values, new_values FROM money_correction
       WHERE source_type = ? AND source_id = ? ORDER BY id`,
      [source, sourceId]
    );

  // Patas de un solo ajuste: hold en la fecha original (−delta), posting hoy (+delta).
  const expectLegPair = (legs: LegRow[], expected: { date: string; direction: string; delta: number; accountId: number | null }) => {
    const hold = legs.filter((leg) => leg.leg === "hold" && leg.payment_account_id === expected.accountId);
    const posting = legs.filter((leg) => leg.leg === "posting" && leg.payment_account_id === expected.accountId);
    expect(hold.map((leg) => [leg.entry_date, leg.direction, money(leg.amount), leg.affected_period])).toEqual([
      [expected.date, expected.direction, -expected.delta, CLOSED_PERIOD],
    ]);
    expect(posting.map((leg) => [leg.entry_date, leg.direction, money(leg.amount), leg.affected_period])).toEqual([
      [TODAY, expected.direction, expected.delta, CLOSED_PERIOD],
    ]);
    expect(legs.every((leg) => leg.kind === "adjustment")).toBe(true);
  };

  // I1: Caja del mes cerrado (toda la empresa) = foto guardada del cierre.
  const expectClosedMonthIntact = async () => {
    const stored = await queryRows<{ account_key: number; income: string; expense: string; adjustments: string }>(
      `SELECT b.account_key, b.income, b.expense, b.adjustments
       FROM cash_period_balance b
       INNER JOIN cash_period p ON p.id = b.cash_period_id
       WHERE p.company_id = ? AND p.period = ? AND p.status = 'closed'`,
      [ctx.companyId, CLOSED_PERIOD]
    );
    expect(stored.length).toBeGreaterThan(0);
    const summary = await cashSummary(`&dateFrom=${CLOSED_START}&dateTo=${CLOSED_END}`);
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
    // Una cuenta que no estaba en el cierre no puede aparecer con plata.
    const storedKeys = new Set(stored.map((row) => Number(row.account_key)));
    const extra = summary.by_account.filter(
      (row) => !storedKeys.has(row.payment_account_id ?? 0) && (money(row.income) !== 0 || money(row.expense) !== 0)
    );
    expect(extra).toEqual([]);
  };

  // I3: hold + posting = 0 por ajuste y por cuenta/tienda/cotización/OC.
  const expectAdjustmentsBalanced = async () => {
    const unbalanced = await queryRows<{ money_correction_id: number }>(
      `SELECT e.money_correction_id
       FROM cash_adjustment_entry e
       WHERE e.company_id = ?
       GROUP BY e.money_correction_id, e.direction, COALESCE(e.payment_account_id, 0), COALESCE(e.business_unit_id, 0),
                COALESCE(e.quotation_id, 0), COALESCE(e.purchase_order_id, 0)
       HAVING ABS(SUM(e.amount)) > 0.001`,
      [ctx.companyId]
    );
    expect(unbalanced).toEqual([]);
    const wrongKind = await queryRows<{ id: number }>(
      `SELECT DISTINCT mc.id FROM cash_adjustment_entry e
       INNER JOIN money_correction mc ON mc.id = e.money_correction_id
       WHERE e.company_id = ? AND mc.kind <> 'adjustment'`,
      [ctx.companyId]
    );
    expect(wrongKind).toEqual([]);
  };

  // Caja del rango abierto: summary.adjustments = Σ efecto de las patas posting.
  const expectOpenAdjustmentsMatchLegs = async () => {
    const [row] = await queryRows<{ total: string | null }>(
      `SELECT SUM(CASE WHEN direction = 'income' THEN amount ELSE -amount END) AS total
       FROM cash_adjustment_entry WHERE company_id = ? AND leg = 'posting' AND entry_date BETWEEN ? AND ?`,
      [ctx.companyId, OPEN_START, TODAY]
    );
    const summary = await cashSummary(`&dateFrom=${OPEN_START}&dateTo=${TODAY}`);
    expect(money(summary.adjustments)).toBe(money(row?.total));
  };

  // Ajustes del rango abierto y neto del rango completo, acotados a una cotización.
  const quotationView = async (quotationId: number) => ({
    open: await cashSummary(`&quotationId=${quotationId}&dateFrom=${OPEN_START}&dateTo=${TODAY}`),
    closed: await cashSummary(`&quotationId=${quotationId}&dateFrom=${CLOSED_START}&dateTo=${CLOSED_END}`),
    all: await cashSummary(`&quotationId=${quotationId}&dateFrom=${CLOSED_START}&dateTo=${TODAY}`),
  });

  // ---------------- datos del mes cerrado ----------------
  const data = {
    manualAmountQuotation: 0,
    manualAmount: 0,
    manualDescription: 0,
    manualDateMove: 0,
    manualToggleQuotation: 0,
    manualToggle: 0,
    manualPreLedger: 0,
    paymentCorrectQuotation: 0,
    paymentCorrect: 0,
    paymentToggleQuotation: 0,
    paymentToggle: 0,
    expenseCorrectQuotation: 0,
    expenseCorrect: 0,
    expenseToggleQuotation: 0,
    expenseToggle: 0,
    workerPurchase: { quotationId: 0, purchaseOrderId: 0, purchaseId: 0, expenseId: 0 },
    switchPurchase: { quotationId: 0, purchaseOrderId: 0, purchaseId: 0, expenseId: 0 },
    companyPurchase: { quotationId: 0, purchaseOrderId: 0, purchaseId: 0, expenseId: 0 },
    debtStoreA: 0,
    debtStoreB: 0,
    reimbursement: 0,
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);

    const storeB = await authedRequest(superToken).post("/business-unit/create", {
      company_id: ctx.companyId,
      business_code: `QB-${wordStamp().slice(0, 6)}`,
    });
    expect(storeB.status).toBe(201);
    storeBId = storeB.body.data.id;
    purchaseWorkerId = (await createUnscopedCompanyAdmin(superToken, ctx.companyId)).userId;
    reimbursementWorkerId = (await createUnscopedCompanyAdmin(superToken, ctx.companyId)).userId;

    // Saldo inicial declarado (inicio = mes que se va a cerrar).
    const opening = await admin().put("/cash-closing/opening", {
      start_period: CLOSED_PERIOD,
      openings: [
        { payment_account_id: null, amount: 500 },
        { payment_account_id: ctx.bankAccountId, amount: 1000 },
        { payment_account_id: ctx.yapeAccountId, amount: 0 },
      ],
      notes: "Saldo inicial de prueba",
    });
    expect(opening.status).toBe(200);

    // Filas fechadas en el mes a cerrar (todavía abierto).
    data.manualAmountQuotation = (await createQuotation()).quotationId;
    data.manualAmount = await createMovement({ quotation_id: data.manualAmountQuotation });
    data.manualDescription = await createMovement({ direction: "expense", category: "otro_egreso", amount: 40, payment_account_id: null });
    data.manualDateMove = await createMovement({ amount: 60, occurred_at: closedDay(25) });
    data.manualToggleQuotation = (await createQuotation()).quotationId;
    data.manualToggle = await createMovement({
      direction: "expense",
      category: "otro_egreso",
      amount: 50,
      payment_account_id: null,
      occurred_at: closedDay(20),
      quotation_id: data.manualToggleQuotation,
    });
    data.manualPreLedger = await createMovement({ amount: 70, occurred_at: PRE_LEDGER_DAY });

    data.paymentCorrectQuotation = (await createQuotation()).quotationId;
    data.paymentCorrect = await createPayment(data.paymentCorrectQuotation);
    data.paymentToggleQuotation = (await createQuotation()).quotationId;
    data.paymentToggle = await createPayment(data.paymentToggleQuotation, { amount: 60, paid_at: closedDay(11) });

    data.expenseCorrectQuotation = (await createQuotation()).quotationId;
    data.expenseCorrect = await createExpense(data.expenseCorrectQuotation);
    data.expenseToggleQuotation = (await createQuotation()).quotationId;
    data.expenseToggle = await createExpense(data.expenseToggleQuotation, { amount: 45, payment_account_id: null });

    data.workerPurchase = await createPurchase({ funding_source: "employee", paid_by_user_id: purchaseWorkerId });
    data.switchPurchase = await createPurchase({ funding_source: "employee", paid_by_user_id: purchaseWorkerId });
    data.companyPurchase = await createPurchase({ funding_source: "company", payment_account_id: ctx.bankAccountId });

    // Reposición que cubre deudas de dos tiendas, llevada al mes a cerrar.
    const manualDebt = async (businessUnitId: number, amount: number) => {
      const res = await admin().post("/employee-debt/create", {
        user_id: reimbursementWorkerId,
        description: `Deuda cierre ${wordStamp().slice(0, 6)}`,
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
    const movedReimbursement = await admin().put(`/employee-debt/payment/update/${data.reimbursement}`, {
      paid_at: closedDay(20),
      reason: "Fecha real de la reposición",
    });
    expect(movedReimbursement.status).toBe(200);

    // Cerrar el mes.
    const closed = await admin().put(`/cash-closing/close/${CLOSED_PERIOD}`, { notes: "Cierre de prueba" });
    expect(closed.status).toBe(200);
  }, SETUP_TIMEOUT);

  afterEach(async () => {
    await expectClosedMonthIntact();
    await expectAdjustmentsBalanced();
    await expectOpenAdjustmentsMatchLegs();
  });

  // =========================================================================
  describe("Crear con fecha en un mes cerrado", () => {
    it("movimiento manual, pago, adelanto al aceptar y gasto → 409 CASH_PERIOD_CLOSED", async () => {
      const manual = await admin().post("/cash-movement/create", {
        direction: "income",
        category: "otro_ingreso",
        amount: 10,
        occurred_at: closedDay(8),
      });
      expect(manual.status).toBe(409);
      expect(manual.body.code).toBe("CASH_PERIOD_CLOSED");
      expect(manual.body.errors).toMatchObject({ period: CLOSED_PERIOD });

      const { quotationId } = await createQuotation();
      const payment = await admin().post(`/quotation/${quotationId}/payments`, {
        amount: 10,
        method: "cash",
        paid_at: closedDay(8),
      });
      expect(payment.status).toBe(409);
      expect(payment.body.code).toBe("CASH_PERIOD_CLOSED");

      const expense = await admin().post(`/quotation/${quotationId}/expenses`, {
        description: "Gasto atrasado",
        amount: 10,
        spent_at: closedDay(8),
      });
      expect(expense.status).toBe(409);
      expect(expense.body.code).toBe("CASH_PERIOD_CLOSED");

      const pending = await createQuotation(null, false);
      const advance = await admin().put(`/quotation/status/${pending.quotationId}`, {
        status: "accepted",
        advance_payment: { amount: 10, method: "cash", paid_at: closedDay(8) },
      });
      expect(advance.status).toBe(409);
      expect(advance.body.code).toBe("CASH_PERIOD_CLOSED");
      // Rollback: la cotización no quedó aceptada.
      expect((await admin().get(`/quotation/find/${pending.quotationId}`)).body.data.status).toBe("pending");

      // En un mes abierto sí se puede.
      const allowed = await admin().post("/cash-movement/create", {
        direction: "income",
        category: "otro_ingreso",
        amount: 10,
        occurred_at: openDay(8),
      });
      expect(allowed.status).toBe(201);
    });

    it("un gestor que registra un pago con fecha de un mes cerrado → 409", async () => {
      const { quotationId } = await createQuotation(ctx.storeId);
      const res = await gestor().post(`/quotation/${quotationId}/payments`, {
        amount: 10,
        method: "cash",
        paid_at: closedDay(9),
      });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("CASH_PERIOD_CLOSED");
    });

    it("una deuda manual con fecha de un mes cerrado sí se registra (no mueve caja)", async () => {
      const res = await admin().post("/employee-debt/create", {
        user_id: reimbursementWorkerId,
        description: "Deuda atrasada",
        category: "pago_servicios",
        amount: 15,
        incurred_at: closedDay(9),
        business_unit_id: ctx.storeId,
      });
      expect(res.status).toBe(201);
      // Se anula para no tocar la reposición de los otros escenarios.
      expect((await admin().put(`/employee-debt/disable/${res.body.data.id}`)).status).toBe(200);
    });
  });

  // =========================================================================
  describe("Movimiento manual", () => {
    it("corregir el monto: en el lugar + ajuste (hold en la fecha original, posting hoy)", async () => {
      const res = await admin().put(`/cash-movement/update/${data.manualAmount}`, {
        amount: 80,
        reason: "El ingreso real fue de 80",
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ kind: "adjustment", adjusted_period: CLOSED_PERIOD });

      expectLegPair(await legsOf("manual", data.manualAmount), {
        date: closedDay(5),
        direction: "income",
        delta: -20,
        accountId: ctx.bankAccountId,
      });
      const [correction] = await correctionsOf("manual", data.manualAmount);
      expect(correction?.kind).toBe("adjustment");

      const view = await quotationView(data.manualAmountQuotation);
      expect(money(view.closed.income)).toBe(100); // el mes cerrado no cambia
      expect(money(view.open.adjustments)).toBe(-20);
      expect(money(view.all.net)).toBe(80); // la verdad
    });

    it("cambiar solo la descripción → corrección normal, sin patas", async () => {
      const res = await admin().put(`/cash-movement/update/${data.manualDescription}`, {
        description: "Solo cambia el texto",
        reason: "Aclarar la descripción",
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ kind: "correction", adjusted_period: null });
      expect(await legsOf("manual", data.manualDescription)).toEqual([]);
      expect((await correctionsOf("manual", data.manualDescription)).map((row) => row.kind)).toEqual(["correction"]);
    });

    it("mover la fecha dentro del mes cerrado o hacia él → 409; sacarla a un mes abierto → ajuste", async () => {
      const within = await admin().put(`/cash-movement/update/${data.manualDateMove}`, {
        occurred_at: closedDay(26),
        reason: "Otro día del mismo mes",
      });
      expect(within.status).toBe(409);
      expect(within.body.code).toBe("CASH_PERIOD_CLOSED");

      const openRow = await createMovement({ amount: 5, occurred_at: openDay(3) });
      const into = await admin().put(`/cash-movement/update/${openRow}`, {
        occurred_at: closedDay(3),
        reason: "Llevarlo al mes cerrado",
      });
      expect(into.status).toBe(409);
      expect(into.body.code).toBe("CASH_PERIOD_CLOSED");
      expect(await legsOf("manual", openRow)).toEqual([]);

      const out = await admin().put(`/cash-movement/update/${data.manualDateMove}`, {
        occurred_at: openDay(2),
        reason: "En realidad entró el mes siguiente",
      });
      expect(out.status).toBe(200);
      expect(out.body.data.kind).toBe("adjustment");
      // Fila viva en el mes abierto (+60), hold +60 en el cerrado, posting −60 hoy.
      expectLegPair(await legsOf("manual", data.manualDateMove), {
        date: closedDay(25),
        direction: "income",
        delta: -60,
        accountId: ctx.bankAccountId,
      });
    });

    it("anular sin motivo → 400 ADJUSTMENT_REASON_REQUIRED; con motivo → ajuste; restaurar también", async () => {
      const noReason = await admin().put(`/cash-movement/disable/${data.manualToggle}`);
      expect(noReason.status).toBe(400);
      expect(noReason.body.code).toBe("ADJUSTMENT_REASON_REQUIRED");
      expect(await legsOf("manual", data.manualToggle)).toEqual([]);

      const shortReason = await admin().put(`/cash-movement/disable/${data.manualToggle}`, { reason: "x" });
      expect(shortReason.status).toBe(400);

      const annulled = await admin().put(`/cash-movement/disable/${data.manualToggle}`, {
        reason: "Se registró dos veces",
      });
      expect(annulled.status).toBe(200);
      expect(annulled.body.data).toMatchObject({ is_deleted: true, kind: "adjustment", adjusted_period: CLOSED_PERIOD });
      const [annulCorrection] = await correctionsOf("manual", data.manualToggle);
      expect(annulCorrection?.kind).toBe("adjustment");
      expect(annulCorrection?.reason).toBe("Se registró dos veces");
      expect(parseJson(annulCorrection?.previous_values ?? "{}")).toEqual({ is_deleted: 0 });
      expect(parseJson(annulCorrection?.new_values ?? "{}")).toEqual({ is_deleted: 1 });

      let view = await quotationView(data.manualToggleQuotation);
      expect(money(view.closed.expense)).toBe(50);
      expect(money(view.open.adjustments)).toBe(50); // un egreso menos: +50 al saldo
      expect(money(view.all.net)).toBe(0);

      const restoreNoReason = await admin().put(`/cash-movement/disable/${data.manualToggle}`);
      expect(restoreNoReason.status).toBe(400);
      expect(restoreNoReason.body.code).toBe("ADJUSTMENT_REASON_REQUIRED");

      const restored = await admin().put(`/cash-movement/disable/${data.manualToggle}`, { reason: "Sí era válido" });
      expect(restored.status).toBe(200);
      expect(restored.body.data).toMatchObject({ is_deleted: false, kind: "adjustment" });
      view = await quotationView(data.manualToggleQuotation);
      expect(money(view.closed.expense)).toBe(50);
      expect(money(view.open.adjustments)).toBe(0);
      expect(money(view.all.net)).toBe(-50);
      expect(await legsOf("manual", data.manualToggle)).toHaveLength(4);
    });

    it("una fila anterior al inicio de la caja se corrige sin patas", async () => {
      const res = await admin().put(`/cash-movement/update/${data.manualPreLedger}`, {
        amount: 75,
        reason: "Ajuste de una fila vieja",
      });
      expect(res.status).toBe(200);
      expect(res.body.data.kind).toBe("correction");
      expect(await legsOf("manual", data.manualPreLedger)).toEqual([]);

      // Anularla tampoco pide motivo.
      const annulled = await admin().put(`/cash-movement/disable/${data.manualPreLedger}`);
      expect(annulled.status).toBe(200);
      expect(annulled.body.data.kind).toBe("correction");
      expect(await correctionsOf("manual", data.manualPreLedger)).toHaveLength(1);
    });

    it("un movimiento de un mes abierto se anula sin motivo, igual que en la fase 1", async () => {
      const openRow = await createMovement({ amount: 7, occurred_at: openDay(4) });
      const annulled = await admin().put(`/cash-movement/disable/${openRow}`);
      expect(annulled.status).toBe(200);
      expect(annulled.body.data).toMatchObject({ is_deleted: true, kind: "correction", adjusted_period: null });
      expect(await correctionsOf("manual", openRow)).toEqual([]);
    });
  });

  // =========================================================================
  describe("Pago de cliente", () => {
    it("corregir el monto: total_paid y saldo por cobrar se actualizan; el cierre no cambia", async () => {
      const quotationId = data.paymentCorrectQuotation;
      const receivableBefore = await receivableBalance(quotationId);
      const res = await admin().put(`/payment/update/${data.paymentCorrect}`, paymentBody({ amount: 80 }));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ kind: "adjustment", adjusted_period: CLOSED_PERIOD });

      expect(await totalPaid(quotationId)).toBe(80);
      expect(await receivableBalance(quotationId)).toBe(money(Number(receivableBefore) + 20));

      expectLegPair(await legsOf("quotation_payment", data.paymentCorrect), {
        date: closedDay(10),
        direction: "income",
        delta: -20,
        accountId: ctx.bankAccountId,
      });
      const view = await quotationView(quotationId);
      expect(money(view.closed.income)).toBe(100);
      expect(money(view.open.adjustments)).toBe(-20);
      expect(money(view.all.net)).toBe(80);
    });

    it("cambiar solo el N° de operación → corrección sin patas", async () => {
      const res = await admin().put(
        `/payment/update/${data.paymentCorrect}`,
        paymentBody({ amount: 80, operation_number: "OP-OTRO", reason: "N° de operación mal tipeado" })
      );
      expect(res.status).toBe(200);
      expect(res.body.data.kind).toBe("correction");
      expect(await legsOf("quotation_payment", data.paymentCorrect)).toHaveLength(2); // solo las del monto
    });

    it("anular sin motivo → 400; con motivo → ajuste y total_paid baja; restaurar con motivo", async () => {
      const quotationId = data.paymentToggleQuotation;
      const noReason = await admin().put(`/payment/disable/${data.paymentToggle}`);
      expect(noReason.status).toBe(400);
      expect(noReason.body.code).toBe("ADJUSTMENT_REASON_REQUIRED");
      expect(await totalPaid(quotationId)).toBe(60);

      const annulled = await admin().put(`/payment/disable/${data.paymentToggle}`, { reason: "Pago duplicado" });
      expect(annulled.status).toBe(200);
      expect(await totalPaid(quotationId)).toBe(0);
      expectLegPair(await legsOf("quotation_payment", data.paymentToggle), {
        date: closedDay(11),
        direction: "income",
        delta: -60,
        accountId: ctx.bankAccountId,
      });
      expect((await correctionsOf("quotation_payment", data.paymentToggle)).map((row) => row.kind)).toEqual(["adjustment"]);

      const restored = await admin().put(`/payment/disable/${data.paymentToggle}`, { reason: "No era duplicado" });
      expect(restored.status).toBe(200);
      expect(await totalPaid(quotationId)).toBe(60);
      const view = await quotationView(quotationId);
      expect(money(view.closed.income)).toBe(60);
      expect(money(view.open.adjustments)).toBe(0);
      expect(money(view.all.net)).toBe(60);
    });

    it("mover la fecha de un pago a un mes cerrado → 409", async () => {
      const { quotationId } = await createQuotation();
      const paymentId = await createPayment(quotationId, { amount: 20, paid_at: openDay(6) });
      const res = await admin().put(`/payment/update/${paymentId}`, paymentBody({ amount: 20, paid_at: closedDay(6) }));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("CASH_PERIOD_CLOSED");
    });
  });

  // =========================================================================
  describe("Gasto manual de cotización", () => {
    it("corregir el monto → ajuste; el mes cerrado conserva su egreso", async () => {
      const res = await admin().put(`/quotation/expense/update/${data.expenseCorrect}`, {
        amount: 130,
        reason: "El gasto real fue 130",
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ kind: "adjustment", adjusted_period: CLOSED_PERIOD });
      expectLegPair(await legsOf("quotation_expense", data.expenseCorrect), {
        date: closedDay(15),
        direction: "expense",
        delta: 30,
        accountId: ctx.bankAccountId,
      });
      const view = await quotationView(data.expenseCorrectQuotation);
      expect(money(view.closed.expense)).toBe(100);
      expect(money(view.open.adjustments)).toBe(-30);
      expect(money(view.all.net)).toBe(-130);
    });

    it("cambiar solo la categoría/descripción → sin patas", async () => {
      const res = await admin().put(`/quotation/expense/update/${data.expenseCorrect}`, {
        description: "Descripción aclarada",
        reason: "Texto más claro",
      });
      expect(res.status).toBe(200);
      expect(res.body.data.kind).toBe("correction");
      expect(await legsOf("quotation_expense", data.expenseCorrect)).toHaveLength(2);
    });

    it("anular sin motivo → 400; con motivo → ajuste", async () => {
      const noReason = await admin().put(`/quotation/expense/disable/${data.expenseToggle}`);
      expect(noReason.status).toBe(400);
      expect(noReason.body.code).toBe("ADJUSTMENT_REASON_REQUIRED");

      const annulled = await admin().put(`/quotation/expense/disable/${data.expenseToggle}`, { reason: "Gasto que no fue" });
      expect(annulled.status).toBe(200);
      expect(annulled.body.data).toMatchObject({ is_deleted: true, kind: "adjustment", adjusted_period: CLOSED_PERIOD });
      expectLegPair(await legsOf("quotation_expense", data.expenseToggle), {
        date: closedDay(15),
        direction: "expense",
        delta: -45,
        accountId: null,
      });
      const view = await quotationView(data.expenseToggleQuotation);
      expect(money(view.closed.expense)).toBe(45);
      expect(money(view.open.adjustments)).toBe(45);
      expect(money(view.all.net)).toBe(0);
    });
  });

  // =========================================================================
  describe("Compra de orden de compra", () => {
    it("cambiar el monto de una compra pagada por el trabajador → sin patas; la deuda se actualiza", async () => {
      const { purchaseId, expenseId } = data.workerPurchase;
      const res = await admin().put(`/purchase-order/purchase/update/${purchaseId}`, {
        amount: 90,
        reason: "El trabajador gastó 90",
      });
      expect(res.status).toBe(200);
      expect(res.body.data.kind).toBe("correction");
      expect(await legsOf("quotation_expense", expenseId)).toEqual([]);
      const found = await admin().get(`/purchase-order/purchase/find/${purchaseId}`);
      expect(found.body.data).toMatchObject({ funding_source: "employee", debt_status: "pending" });
      expect(money(found.body.data.debt_amount)).toBe(90);
    });

    it("pasar de trabajador a empresa en un mes cerrado → ajuste; la deuda queda anulada", async () => {
      const { purchaseId, expenseId, quotationId } = data.switchPurchase;
      const res = await admin().put(`/purchase-order/purchase/update/${purchaseId}`, {
        funding_source: "company",
        payment_account_id: ctx.bankAccountId,
        reason: "En realidad pagó la empresa",
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ kind: "adjustment", adjusted_period: CLOSED_PERIOD });
      // Antes no movía caja; después, egreso de 100 el día original.
      expectLegPair(await legsOf("quotation_expense", expenseId), {
        date: closedDay(12),
        direction: "expense",
        delta: 100,
        accountId: ctx.bankAccountId,
      });
      const found = await admin().get(`/purchase-order/purchase/find/${purchaseId}`);
      expect(found.body.data.funding_source).toBe("company");
      expect(found.body.data.debt_status === null || found.body.data.debt_status === "cancelled").toBe(true);
      const view = await quotationView(quotationId);
      expect(money(view.closed.expense)).toBe(0);
      expect(money(view.open.adjustments)).toBe(-100);
      expect(money(view.all.net)).toBe(-100);
    });

    it("anular una compra de la empresa sin motivo → 400; con motivo → ajuste y el item vuelve a pendiente", async () => {
      const { purchaseId, expenseId, purchaseOrderId, quotationId } = data.companyPurchase;
      const noReason = await admin().put(`/purchase-order/purchase/disable/${purchaseId}`);
      expect(noReason.status).toBe(400);
      expect(noReason.body.code).toBe("ADJUSTMENT_REASON_REQUIRED");
      expect((await admin().get(`/purchase-order/find/${purchaseOrderId}`)).body.data.items[0].status).toBe("purchased");

      const annulled = await admin().put(`/purchase-order/purchase/disable/${purchaseId}`, { reason: "Compra registrada por error" });
      expect(annulled.status).toBe(200);
      expect(annulled.body.data).toMatchObject({ is_deleted: true, kind: "adjustment" });
      expectLegPair(await legsOf("quotation_expense", expenseId), {
        date: closedDay(12),
        direction: "expense",
        delta: -100,
        accountId: ctx.bankAccountId,
      });
      const order = (await admin().get(`/purchase-order/find/${purchaseOrderId}`)).body.data;
      expect(order.items[0].status).toBe("pending");
      expect(order.status).toBe("pending");
      const view = await quotationView(quotationId);
      expect(money(view.closed.expense)).toBe(100);
      expect(money(view.all.net)).toBe(0);
    });
  });

  // =========================================================================
  describe("Reposición a un trabajador", () => {
    it("bajar el monto → patas por tienda; lo repuesto de cada deuda se recalcula", async () => {
      const allocationsOf = async () => {
        const res = await admin().get(`/employee-debt/payment/find/${data.reimbursement}`);
        expect(res.status).toBe(200);
        return new Map(
          (res.body.data.allocations as { employee_debt_id: number; allocated_amount: number }[]).map((line) => [
            line.employee_debt_id,
            money(line.allocated_amount),
          ])
        );
      };
      const before = await allocationsOf();
      expect([...before.values()].reduce((sum, value) => sum + value, 0)).toBe(150);

      const res = await admin().put(`/employee-debt/payment/update/${data.reimbursement}`, {
        amount: 120,
        reason: "Se repuso de más",
      });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ kind: "adjustment", adjusted_period: CLOSED_PERIOD });

      const after = await allocationsOf();
      expect(money([...after.values()].reduce((sum, value) => sum + value, 0))).toBe(120);

      // Δ por tienda (egreso): después − antes de lo asignado a la deuda de esa tienda.
      const storeOfDebt = new Map([
        [data.debtStoreA, ctx.storeId],
        [data.debtStoreB, storeBId],
      ]);
      const expectedByStore = new Map<number, number>();
      for (const debtId of new Set([...before.keys(), ...after.keys()])) {
        const store = storeOfDebt.get(debtId);
        if (store === undefined) continue;
        const delta = money((after.get(debtId) ?? 0) - (before.get(debtId) ?? 0));
        expectedByStore.set(store, money((expectedByStore.get(store) ?? 0) + delta));
      }

      const legs = await legsOf("employee_debt_payment", data.reimbursement);
      expect(legs.length).toBeGreaterThan(0);
      for (const [store, delta] of expectedByStore) {
        const storeLegs = legs.filter((leg) => leg.business_unit_id === store);
        if (delta === 0) {
          expect(storeLegs).toEqual([]);
          continue;
        }
        const hold = storeLegs.filter((leg) => leg.leg === "hold");
        const posting = storeLegs.filter((leg) => leg.leg === "posting");
        expect(hold.map((leg) => [leg.entry_date, money(leg.amount)])).toEqual([[closedDay(20), -delta]]);
        expect(posting.map((leg) => [leg.entry_date, money(leg.amount)])).toEqual([[TODAY, delta]]);
      }
      expect(money(legs.filter((leg) => leg.leg === "posting").reduce((sum, leg) => sum + Number(leg.amount), 0))).toBe(-30);

      // Lo repuesto de cada deuda = su asignación viva.
      const debts = await queryRows<{ id: number; paid_amount: string; status: string; amount: string }>(
        "SELECT id, paid_amount, status, amount FROM employee_debt WHERE id IN (?, ?)",
        [data.debtStoreA, data.debtStoreB]
      );
      for (const debt of debts) {
        expect(money(debt.paid_amount)).toBe(after.get(debt.id) ?? 0);
        expect(debt.status).toBe(money(debt.paid_amount) >= money(debt.amount) ? "paid" : "pending");
      }
    });
  });
});
