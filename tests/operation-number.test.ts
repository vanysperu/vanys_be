import { authedRequest, login } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import {
  createCashClosingTestCompany,
  createPurchaseOrderFixture,
  createQuotationFixture,
  type CashClosingTestCompany,
} from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const REASON = "Faltaba el número de operación";

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
  operation_number: string | null;
  moves_cash: boolean;
}

/**
 * N.° de operación del dinero que sale de la empresa (pedido explícito del
 * usuario). Es opcional y no es dinero: nunca cambia Caja, ni en un mes cerrado.
 * Empresas desechables: nunca usa las cuentas QA del equipo.
 */
describe("Número de operación del dinero de la empresa", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let quotationId: number;
  let quotationItemId: number;
  let itemId: number;

  const admin = () => authedRequest(ctx.admin.token);
  const cashRows = async (): Promise<CashRow[]> => (await admin().get("/cash-movement/list?page=1&limit=100")).body.data.data as CashRow[];
  const cashRowOf = async (source: string, sourceId: number) => (await cashRows()).find((row) => row.source === source && row.source_id === sourceId);
  const buy = async (body: object) => {
    const res = await admin().post(`/purchase-order/item/${itemId}/purchases`, { quantity: 2, amount: 40, ...body });
    expect(res.status).toBe(201);
    return res.body.data as { id: number; quotation_expense_id: number };
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    ({ quotationId, quotationItemId } = await createQuotationFixture(ctx.admin.token, ctx.companyId));
    ({ itemId } = await createPurchaseOrderFixture(ctx.admin.token, ctx.companyId, ctx.admin.userId, quotationId, quotationItemId, 50));
  }, 60_000);

  afterAll(async () => {
    if (ctx?.companyId) await authedRequest(superToken).put(`/company/disable/${ctx.companyId}`);
  });

  describe("gasto de una cotización", () => {
    let expenseId: number;

    it("se registra con número y sale en el detalle, la pestaña Gastos y Caja", async () => {
      const res = await admin().post(`/quotation/${quotationId}/expenses`, { description: "Delivery", amount: 20, spent_at: TODAY, operation_number: " OP-1001 " });
      expect(res.status).toBe(201);
      expenseId = res.body.data.id;
      expect(res.body.data.operation_number).toBe("OP-1001");
      expect((await admin().get(`/quotation/expense/find/${expenseId}`)).body.data.operation_number).toBe("OP-1001");
      const detail = await admin().get(`/quotation/find/${quotationId}`);
      expect((detail.body.data.expenses as { id: number; operation_number: string }[]).find((row) => row.id === expenseId)?.operation_number).toBe("OP-1001");
      expect((await cashRowOf("quotation_expense", expenseId))?.operation_number).toBe("OP-1001");
    });

    it("es opcional", async () => {
      const res = await admin().post(`/quotation/${quotationId}/expenses`, { description: "Sin número", amount: 5, spent_at: TODAY });
      expect(res.status).toBe(201);
      expect(res.body.data.operation_number).toBeNull();
    });

    it("se corrige, se quita y queda en el historial", async () => {
      expect((await admin().put(`/quotation/expense/update/${expenseId}`, { operation_number: "OP-2002", reason: REASON })).status).toBe(200);
      const history = await admin().get(`/quotation/expense/${expenseId}/corrections`);
      expect(history.body.data.data[0]).toMatchObject({ previous_values: { operation_number: "OP-1001" }, new_values: { operation_number: "OP-2002" } });
      expect((await admin().put(`/quotation/expense/update/${expenseId}`, { operation_number: null, reason: REASON })).status).toBe(200);
      expect((await admin().get(`/quotation/expense/find/${expenseId}`)).body.data.operation_number).toBeNull();
    });

    it("rechaza un número demasiado largo", async () => {
      const res = await admin().post(`/quotation/${quotationId}/expenses`, { description: "Largo", amount: 5, spent_at: TODAY, operation_number: "9".repeat(51) });
      expect(res.status).toBe(400);
    });
  });

  describe("compra de una orden", () => {
    it("con plata de la empresa, el número queda en su gasto y sale en la compra y en Caja", async () => {
      const purchase = await buy({ funding_source: "company", operation_number: "OP-3003" });
      const found = await admin().get(`/purchase-order/purchase/find/${purchase.id}`);
      expect(found.body.data.operation_number).toBe("OP-3003");
      expect((await cashRowOf("quotation_expense", purchase.quotation_expense_id))?.operation_number).toBe("OP-3003");

      const corrected = await admin().put(`/purchase-order/purchase/update/${purchase.id}`, { operation_number: "OP-3004", reason: REASON });
      expect(corrected.status).toBe(200);
      expect(corrected.body.data.changed_fields).toEqual(["operation_number"]);
      expect((await admin().get(`/purchase-order/purchase/find/${purchase.id}`)).body.data.operation_number).toBe("OP-3004");
    });

    it("con plata de un trabajador no aplica: el número va en la reposición", async () => {
      const rejected = await admin().post(`/purchase-order/item/${itemId}/purchases`, {
        quantity: 2,
        amount: 40,
        funding_source: "employee",
        paid_by_user_id: ctx.admin.userId,
        operation_number: "OP-X",
      });
      expect(rejected.status).toBe(400);

      const purchase = await buy({ funding_source: "employee", paid_by_user_id: ctx.admin.userId });
      const onCorrect = await admin().put(`/purchase-order/purchase/update/${purchase.id}`, { operation_number: "OP-X", reason: REASON });
      expect(onCorrect.status).toBe(400);
      expect(onCorrect.body.code).toBe("OPERATION_NUMBER_NOT_ALLOWED");
    });

    it("pasar una compra a plata de un trabajador le quita el número", async () => {
      const purchase = await buy({ funding_source: "company", operation_number: "OP-3005" });
      const res = await admin().put(`/purchase-order/purchase/update/${purchase.id}`, {
        funding_source: "employee",
        paid_by_user_id: ctx.admin.userId,
        reason: "La pagó un trabajador con su plata",
      });
      expect(res.status).toBe(200);
      expect((await admin().get(`/purchase-order/purchase/find/${purchase.id}`)).body.data.operation_number).toBeNull();
      expect((await cashRowOf("quotation_expense", purchase.quotation_expense_id))?.operation_number).toBeNull();
    });
  });

  describe("movimiento manual de Caja", () => {
    it("se registra, sale en Caja y se corrige", async () => {
      const created = await admin().post("/cash-movement/create", {
        direction: "expense",
        category: "otro_egreso",
        amount: 15,
        occurred_at: TODAY,
        operation_number: "OP-4004",
      });
      expect(created.status).toBe(201);
      const movementId = created.body.data.id as number;
      expect((await cashRowOf("manual", movementId))?.operation_number).toBe("OP-4004");

      expect((await admin().put(`/cash-movement/update/${movementId}`, { operation_number: "OP-4005", reason: REASON })).status).toBe(200);
      expect((await cashRowOf("manual", movementId))?.operation_number).toBe("OP-4005");
    });
  });

  describe("reposición a un trabajador", () => {
    it("se registra, sale en Caja y en el historial, y se corrige", async () => {
      const paid = await admin().put(`/employee-debt/pay/${ctx.admin.userId}`, { amount: 10, operation_number: "OP-5005" });
      expect(paid.status).toBe(200);
      const paymentId = (await queryRows<{ id: number }>("SELECT id FROM employee_debt_payment WHERE user_id = ? ORDER BY id DESC LIMIT 1", [ctx.admin.userId]))[0]?.id as number;
      expect((await cashRowOf("employee_debt_payment", paymentId))?.operation_number).toBe("OP-5005");

      const corrected = await admin().put(`/employee-debt/payment/update/${paymentId}`, { operation_number: "OP-5006", reason: REASON });
      expect(corrected.status).toBe(200);
      expect(corrected.body.data.changed_fields).toEqual(["operation_number"]);
      expect((await cashRowOf("employee_debt_payment", paymentId))?.operation_number).toBe("OP-5006");
    });
  });

  // Lo más delicado: el número no es dinero, así que un mes cerrado no se toca.
  describe("mes de caja cerrado", () => {
    let closedCtx: CashClosingTestCompany;
    let expenseId: number;
    let movementId: number;
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
      const { quotationId: closedQuotationId } = await createQuotationFixture(closedCtx.admin.token, closedCtx.companyId);
      const expense = await closedApi().post(`/quotation/${closedQuotationId}/expenses`, { description: "Gasto viejo", amount: 30, spent_at: `${CLOSED_PERIOD}-10` });
      expect(expense.status).toBe(201);
      expenseId = expense.body.data.id;
      const movement = await closedApi().post("/cash-movement/create", { direction: "expense", category: "otro_egreso", amount: 12, occurred_at: `${CLOSED_PERIOD}-11` });
      expect(movement.status).toBe(201);
      movementId = movement.body.data.id;
      expect((await closedApi().put(`/cash-closing/close/${CLOSED_PERIOD}`, { notes: "Cierre" })).status).toBe(200);
      totalsBefore = (await closedApi().get(`/cash-closing/find/${CLOSED_PERIOD}`)).body.data.totals;
    }, 60_000);

    afterAll(async () => {
      if (closedCtx?.companyId) await authedRequest(superToken).put(`/company/disable/${closedCtx.companyId}`);
    });

    it("agregar el número no crea ajuste ni cambia el cierre", async () => {
      const onExpense = await closedApi().put(`/quotation/expense/update/${expenseId}`, { operation_number: "OP-OLD-1", reason: REASON });
      expect(onExpense.status).toBe(200);
      expect(onExpense.body.data.kind).toBe("correction");
      const onMovement = await closedApi().put(`/cash-movement/update/${movementId}`, { operation_number: "OP-OLD-2", reason: REASON });
      expect(onMovement.status).toBe(200);
      expect(onMovement.body.data.kind).toBe("correction");

      const legs = await queryRows<{ total: number }>(
        "SELECT COUNT(*) AS total FROM cash_adjustment_entry WHERE (source_type = 'quotation_expense' AND source_id = ?) OR (source_type = 'manual' AND source_id = ?)",
        [expenseId, movementId]
      );
      expect(Number(legs[0]?.total)).toBe(0);
      expect((await closedApi().get(`/cash-closing/find/${CLOSED_PERIOD}`)).body.data.totals).toEqual(totalsBefore);
    });
  });
});
