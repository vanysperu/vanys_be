import { authedRequest, login } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import {
  createCashClosingTestCompany,
  createQuotationFixture,
  type CashClosingTestCompany,
} from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const REASON = "Se registró mal quién pagó";

const limaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
const shiftPeriod = (period: string, months: number): string => {
  const [year = 0, month = 1] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 7);
};

const TODAY = limaToday();
const CLOSED_PERIOD = shiftPeriod(TODAY.slice(0, 7), -2);

interface CashRow {
  source: string;
  source_id: number;
  amount: number;
  moves_cash: boolean;
  paid_by_employee_name: string | null;
  reimbursement_status: string | null;
}

interface DebtRow {
  id: number;
  origin: string;
  status: string;
  amount: string;
  paid_amount: string;
  user_id: number;
  incurred_at: string;
}

/**
 * Gasto de cotización pagado con plata de un trabajador (pedido explícito del
 * usuario). Hasta reponerle, la plata no sale de Caja; se sigue contando como
 * costo de la cotización. Empresas desechables: nunca usa las cuentas QA.
 */
describe("Gasto pagado con plata de un trabajador", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let quotationId: number;

  const admin = () => authedRequest(ctx.admin.token);
  const debtOf = async (expenseId: number): Promise<DebtRow | undefined> =>
    (await queryRows<DebtRow>(
      "SELECT id, origin, status, amount, paid_amount, user_id, DATE_FORMAT(incurred_at, '%Y-%m-%d') AS incurred_at FROM employee_debt WHERE quotation_expense_id = ?",
      [expenseId]
    ))[0];
  const cashRows = async (query = ""): Promise<CashRow[]> =>
    (await admin().get(`/cash-movement/list?page=1&limit=100${query}`)).body.data.data as CashRow[];
  const expenseRow = async (expenseId: number) => (await cashRows()).find((row) => row.source === "quotation_expense" && row.source_id === expenseId);
  const addExpense = async (body: object) => {
    const res = await admin().post(`/quotation/${quotationId}/expenses`, { description: "Delivery", amount: 40, spent_at: TODAY, ...body });
    expect(res.status).toBe(201);
    return res.body.data.id as number;
  };
  const workerExpense = (body: object = {}) => addExpense({ funding_source: "employee", paid_by_user_id: ctx.gestor.userId, ...body });
  const pendingOfWorker = async (userId: number) =>
    Number((await queryRows<{ total: string }>("SELECT COALESCE(SUM(amount - paid_amount), 0) AS total FROM employee_debt WHERE user_id = ? AND status = 'pending'", [userId]))[0]?.total);
  // Salda lo pendiente: cada prueba arranca con el trabajador en cero.
  const settle = async (userId: number) => {
    const pending = await pendingOfWorker(userId);
    if (pending > 0) expect((await admin().put(`/employee-debt/pay/${userId}`, { amount: pending })).status).toBe(200);
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    ({ quotationId } = await createQuotationFixture(ctx.admin.token, ctx.companyId));
  }, 60_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  describe("al registrarlo", () => {
    it("sin indicar nada sigue siendo plata de la empresa, sin deuda", async () => {
      const expenseId = await addExpense({});
      expect(await debtOf(expenseId)).toBeUndefined();
      expect((await expenseRow(expenseId))?.moves_cash).toBe(true);
    });

    it("con plata de un trabajador nace su deuda y no sale de Caja", async () => {
      const expenseId = await workerExpense({ amount: 55 });
      const debt = await debtOf(expenseId);
      expect(debt).toMatchObject({ origin: "expense", status: "pending", user_id: ctx.gestor.userId, incurred_at: TODAY });
      expect(Number(debt?.amount)).toBe(55);

      const row = await expenseRow(expenseId);
      expect(row).toMatchObject({ moves_cash: false, reimbursement_status: "pending" });
      expect(row?.paid_by_employee_name).toBeTruthy();

      const detail = await admin().get(`/quotation/find/${quotationId}`);
      const listed = (detail.body.data.expenses as { id: number; funding_source: string; paid_by_user_name: string; debt_status: string }[]).find(
        (expense) => expense.id === expenseId
      );
      expect(listed).toMatchObject({ funding_source: "employee", debt_status: "pending" });
      expect(listed?.paid_by_user_name).toBeTruthy();
      const found = await admin().get(`/quotation/expense/find/${expenseId}`);
      expect(found.body.data).toMatchObject({ funding_source: "employee", paid_by_user_id: ctx.gestor.userId, debt_paid_amount: 0 });
      await settle(ctx.gestor.userId);
    });

    it("no acepta cuenta ni n.° de operación: esos van en la reposición", async () => {
      const onAccount = await admin().post(`/quotation/${quotationId}/expenses`, {
        description: "Mal",
        amount: 5,
        spent_at: TODAY,
        funding_source: "employee",
        paid_by_user_id: ctx.gestor.userId,
        operation_number: "OP-1",
      });
      expect(onAccount.status).toBe(400);
      expect(onAccount.body.code).toBe("OPERATION_NUMBER_NOT_ALLOWED");
    });

    it("el trabajador tiene que ser de la empresa de la cotización", async () => {
      const other = await createCashClosingTestCompany(superToken);
      const res = await admin().post(`/quotation/${quotationId}/expenses`, {
        description: "Mal",
        amount: 5,
        spent_at: TODAY,
        funding_source: "employee",
        paid_by_user_id: other.admin.userId,
      });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("EMPLOYEE_NOT_AVAILABLE");
      await authedRequest(superToken).put(`/company/disable/${other.companyId}`);
    });

    it("una falla no deja el gasto suelto", async () => {
      const before = await queryRows<{ total: number }>("SELECT COUNT(*) AS total FROM quotation_expense WHERE quotation_id = ?", [quotationId]);
      await admin().post(`/quotation/${quotationId}/expenses`, { description: "Mal", amount: 5, spent_at: TODAY, funding_source: "employee", paid_by_user_id: 999999999 });
      const after = await queryRows<{ total: number }>("SELECT COUNT(*) AS total FROM quotation_expense WHERE quotation_id = ?", [quotationId]);
      expect(Number(after[0]?.total)).toBe(Number(before[0]?.total));
    });
  });

  describe("Caja, costo y reposición", () => {
    it("recién al reponerle sale de Caja, y el filtro por cotización la encuentra", async () => {
      const expenseId = await workerExpense({ amount: 70 });
      const reimbursementsBefore = (await cashRows(`&quotationId=${quotationId}`)).filter((row) => row.source === "employee_debt_payment").length;

      expect((await admin().put(`/employee-debt/pay/${ctx.gestor.userId}`, { amount: 70 })).status).toBe(200);

      expect((await debtOf(expenseId))?.status).toBe("paid");
      const rows = await cashRows(`&quotationId=${quotationId}`);
      const reimbursements = rows.filter((row) => row.source === "employee_debt_payment");
      expect(reimbursements).toHaveLength(reimbursementsBefore + 1);
      expect(reimbursements.some((row) => Math.abs(row.amount) === 70 && row.moves_cash)).toBe(true);
    });

    it("cuenta como costo de la cotización aunque no haya salido de Caja", async () => {
      const profitBefore = (await admin().get(`/quotation/${quotationId}/profit`)).body.data.expenses as number;
      await workerExpense({ amount: 12 });
      const profitAfter = (await admin().get(`/quotation/${quotationId}/profit`)).body.data.expenses as number;
      expect(profitAfter).toBeCloseTo(profitBefore + 12);
      await settle(ctx.gestor.userId);
    });
  });

  describe("al anular y restaurar", () => {
    it("la deuda sigue al gasto", async () => {
      const expenseId = await workerExpense({ amount: 25 });
      expect((await admin().put(`/quotation/expense/disable/${expenseId}`, {})).status).toBe(200);
      expect((await debtOf(expenseId))?.status).toBe("cancelled");

      expect((await admin().put(`/quotation/expense/disable/${expenseId}`, {})).status).toBe(200);
      expect((await debtOf(expenseId))?.status).toBe("pending");
      expect((await expenseRow(expenseId))?.moves_cash).toBe(false);
      await settle(ctx.gestor.userId);
    });

    it("no se anula si ya se le repuso", async () => {
      const expenseId = await workerExpense({ amount: 33 });
      await settle(ctx.gestor.userId);
      const res = await admin().put(`/quotation/expense/disable/${expenseId}`, {});
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("PURCHASE_DEBT_REIMBURSED");
      expect(res.body.message).toContain("este gasto");
      expect((await debtOf(expenseId))?.status).toBe("paid");
    });

    it("la deuda no se toca desde Deudas a personal", async () => {
      const expenseId = await workerExpense({ amount: 9 });
      const debt = await debtOf(expenseId);
      const res = await admin().put(`/employee-debt/disable/${debt?.id}`, {});
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.message).toContain("gasto");
      expect((await debtOf(expenseId))?.status).toBe("pending");
      await settle(ctx.gestor.userId);
    });
  });

  describe("al corregir", () => {
    it("monto y fecha se mueven junto con la deuda", async () => {
      const expenseId = await workerExpense({ amount: 30 });
      expect((await admin().put(`/quotation/expense/update/${expenseId}`, { amount: 44, reason: REASON })).status).toBe(200);
      expect(Number((await debtOf(expenseId))?.amount)).toBe(44);
      await settle(ctx.gestor.userId);
    });

    it("de la empresa a un trabajador: sale de Caja y nace la deuda", async () => {
      const expenseId = await addExpense({ amount: 60 });
      const res = await admin().put(`/quotation/expense/update/${expenseId}`, { funding_source: "employee", paid_by_user_id: ctx.gestor.userId, reason: REASON });
      expect(res.status).toBe(200);
      expect((await debtOf(expenseId))?.status).toBe("pending");
      expect((await expenseRow(expenseId))?.moves_cash).toBe(false);
      await settle(ctx.gestor.userId);
    });

    it("de un trabajador a la empresa: entra a Caja y se anula la deuda", async () => {
      const expenseId = await workerExpense({ amount: 61 });
      const res = await admin().put(`/quotation/expense/update/${expenseId}`, { funding_source: "company", reason: REASON });
      expect(res.status).toBe(200);
      expect((await debtOf(expenseId))?.status).toBe("cancelled");
      expect((await expenseRow(expenseId))?.moves_cash).toBe(true);
    });

    it("volver a un trabajador reactiva la misma deuda", async () => {
      const expenseId = await workerExpense({ amount: 62 });
      await admin().put(`/quotation/expense/update/${expenseId}`, { funding_source: "company", reason: REASON });
      const debtId = (await debtOf(expenseId))?.id;
      expect((await admin().put(`/quotation/expense/update/${expenseId}`, { funding_source: "employee", paid_by_user_id: ctx.admin.userId, reason: REASON })).status).toBe(200);
      expect(await debtOf(expenseId)).toMatchObject({ id: debtId, status: "pending", user_id: ctx.admin.userId });
      await settle(ctx.admin.userId);
    });

    it("con reposición hecha no se quita la deuda ni se baja de lo repuesto", async () => {
      const expenseId = await workerExpense({ amount: 80 });
      expect((await admin().put(`/employee-debt/pay/${ctx.gestor.userId}`, { amount: 50 })).status).toBe(200);

      const toCompany = await admin().put(`/quotation/expense/update/${expenseId}`, { funding_source: "company", reason: REASON });
      expect(toCompany.status).toBe(409);
      expect(toCompany.body.code).toBe("PURCHASE_DEBT_REIMBURSED");
      const otherWorker = await admin().put(`/quotation/expense/update/${expenseId}`, { paid_by_user_id: ctx.admin.userId, reason: REASON });
      expect(otherWorker.status).toBe(409);
      const below = await admin().put(`/quotation/expense/update/${expenseId}`, { amount: 30, reason: REASON });
      expect(below.status).toBe(409);
      expect(below.body.code).toBe("DEBT_BELOW_REIMBURSED");

      const history = await admin().put(`/quotation/expense/update/${expenseId}`, { amount: 55, reason: REASON });
      expect(history.status).toBe(200);
      expect(Number((await debtOf(expenseId))?.amount)).toBe(55);
      await settle(ctx.gestor.userId);
    });
  });

  // Un gasto que ya estaba en un mes cerrado no puede cambiar ese mes por debajo.
  describe("mes de caja cerrado", () => {
    let closedCtx: CashClosingTestCompany;
    let closedQuotationId: number;
    let companyExpenseId: number;
    let workerExpenseId: number;
    let totalsBefore: unknown;
    const closedApi = () => authedRequest(closedCtx.admin.token);

    beforeAll(async () => {
      closedCtx = await createCashClosingTestCompany(superToken);
      const opening = await closedApi().put("/cash-closing/opening", {
        start_period: CLOSED_PERIOD,
        openings: [{ payment_account_id: null, amount: 500 }],
        notes: "Saldo inicial",
      });
      expect(opening.status).toBe(200);
      ({ quotationId: closedQuotationId } = await createQuotationFixture(closedCtx.admin.token, closedCtx.companyId));
      const company = await closedApi().post(`/quotation/${closedQuotationId}/expenses`, { description: "Empresa", amount: 30, spent_at: `${CLOSED_PERIOD}-10` });
      expect(company.status).toBe(201);
      companyExpenseId = company.body.data.id;
      const worker = await closedApi().post(`/quotation/${closedQuotationId}/expenses`, {
        description: "Trabajador",
        amount: 20,
        spent_at: `${CLOSED_PERIOD}-11`,
        funding_source: "employee",
        paid_by_user_id: closedCtx.gestor.userId,
      });
      expect(worker.status).toBe(201);
      workerExpenseId = worker.body.data.id;
      expect((await closedApi().put(`/cash-closing/close/${CLOSED_PERIOD}`, { notes: "Cierre" })).status).toBe(200);
      totalsBefore = (await closedApi().get(`/cash-closing/find/${CLOSED_PERIOD}`)).body.data.totals;
    }, 60_000);

    afterAll(async () => {
      if (closedCtx?.companyId) await authedRequest(superToken).put(`/company/disable/${closedCtx.companyId}`);
    });

    it("el gasto del trabajador no contó en el cierre", () => {
      expect(totalsBefore).toMatchObject({ opening: 500, expense: 30, closing: 470 });
    });

    it("pasar a un trabajador un gasto de la empresa queda como ajuste, sin cambiar el mes", async () => {
      const res = await closedApi().put(`/quotation/expense/update/${companyExpenseId}`, {
        funding_source: "employee",
        paid_by_user_id: closedCtx.gestor.userId,
        reason: REASON,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.kind).toBe("adjustment");
      expect((await closedApi().get(`/cash-closing/find/${CLOSED_PERIOD}`)).body.data.totals).toMatchObject({ opening: 500, closing: 470 });
    });

    it("un gasto del trabajador de un mes cerrado se corrige sin ajuste: nunca movió caja", async () => {
      const res = await closedApi().put(`/quotation/expense/update/${workerExpenseId}`, { amount: 25, reason: REASON });
      expect(res.status).toBe(200);
      expect(res.body.data.kind).toBe("correction");
      expect(Number((await debtOf(workerExpenseId))?.amount)).toBe(25);
    });
  });

  it("resetear la cotización borra el gasto y su deuda", async () => {
    const { quotationId: resetId } = await createQuotationFixture(ctx.admin.token, ctx.companyId);
    const created = await admin().post(`/quotation/${resetId}/expenses`, { description: "Para borrar", amount: 15, spent_at: TODAY, funding_source: "employee", paid_by_user_id: ctx.gestor.userId });
    expect(created.status).toBe(201);
    const expenseId = created.body.data.id as number;

    const preview = await authedRequest(superToken).get(`/quotation/${resetId}/reset-preview`);
    expect(preview.body.data.summary.debts).toEqual({ count: 1, total: 15 });

    expect((await authedRequest(superToken).put(`/quotation/${resetId}/reset`, { reason: "Cotización de prueba" })).status).toBe(200);
    expect(await debtOf(expenseId)).toBeUndefined();
    expect(await queryRows("SELECT id FROM quotation_expense WHERE id = ?", [expenseId])).toHaveLength(0);
  });
});
