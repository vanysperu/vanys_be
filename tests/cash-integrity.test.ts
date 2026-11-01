import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import { createPurchaseOrderFixture, createQuotationFixture, createUnscopedCompanyAdmin } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

// Día de hoy en Lima (YYYY-MM-DD), desplazado `days` días.
const limaDate = (days = 0) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const [year = 0, month = 1, day = 1] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

interface CashRow {
  source: string;
  source_id: number;
  direction: string;
  amount: number;
  moves_cash: boolean;
  payment_account_id: number | null;
  paid_by_employee_name: string | null;
  reimbursement_status: string | null;
  reimbursement_total: number | null;
}

interface CashSummary {
  income: number;
  expense: number;
  net: number;
  by_account: { payment_account_id: number | null; income: number; expense: number }[];
}

/**
 * Pedido explícito del usuario: "validaciones para que no sea posible
 * malograr caja". Caja = dinero que REALMENTE entra o sale de la empresa.
 * Todo corre en una empresa nueva, sin datos de otras pruebas: así los
 * totales y el reparto de reposiciones (FIFO) se comparan con valores exactos.
 */
describe("Caja no se puede descuadrar", () => {
  let token: string;
  let userId: number;
  let companyId: number;
  let bcpId: number;
  let yapeId: number;

  const api = () => authedRequest(token);
  const cash = async (query = "") => {
    const res = await api().get(`/cash-movement/list?limit=100${query}`);
    expect(res.status).toBe(200);
    return { rows: res.body.data.data as CashRow[], summary: res.body.data.summary as CashSummary };
  };
  const pendingOf = async (worker: number) => {
    const res = await api().get(`/employee-debt/list?status=all&userId=${worker}`);
    return Number(res.body.data.data.find((row: { user_id: number }) => row.user_id === worker)?.pending_amount ?? 0);
  };
  const employeePurchase = async (amount: number) => {
    const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
    const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId);
    const res = await api().post(`/purchase-order/item/${itemId}/purchases`, {
      quantity: 10,
      amount,
      funding_source: "employee",
    });
    expect(res.status).toBe(201);
    return quotationId;
  };
  const createAccount = async (name: string, prefix: "bank" | "yape") => {
    const res = await api().post("/variable_general/create", {
      category: "payment_account",
      title: "Cuenta",
      prefix_id: prefix,
      name,
      ref1: "123",
      company_id: companyId,
    });
    expect(res.status).toBe(200);
    return res.body.data.id as number;
  };

  beforeAll(async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const company = await authedRequest(superToken).post("/company/create", {
      ruc: `208${Date.now().toString().slice(-8)}`,
      business_name: `CashCo ${wordStamp().slice(0, 8)}`,
    });
    companyId = company.body.data.id;
    const admin = await createUnscopedCompanyAdmin(superToken, companyId);
    token = admin.token;
    userId = admin.userId;
    bcpId = await createAccount("BCP Caja", "bank");
    yapeId = await createAccount("Yape Caja", "yape");
  });

  it("una compra pagada por la empresa es un egreso desde la cuenta elegida", async () => {
    const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
    const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId);
    const res = await api().post(`/purchase-order/item/${itemId}/purchases`, {
      quantity: 10,
      amount: 40,
      funding_source: "company",
      payment_account_id: bcpId,
    });
    expect(res.status).toBe(201);

    const { rows } = await cash(`&quotationId=${quotationId}`);
    const expense = rows.find((row) => row.source === "quotation_expense");
    expect(expense?.moves_cash).toBe(true);
    expect(expense?.payment_account_id).toBe(bcpId);
  });

  it("una compra con plata del trabajador no admite una cuenta de la empresa", async () => {
    const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
    const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId);
    const res = await api().post(`/purchase-order/item/${itemId}/purchases`, {
      quantity: 10,
      amount: 10,
      funding_source: "employee",
      payment_account_id: bcpId,
    });
    expect(res.status).toBe(400);
  });

  it("lo que pagó un trabajador no mueve caja hasta reponerle; dos abonos desde cuentas distintas son dos egresos", async () => {
    const firstQuotation = await employeePurchase(100);
    const secondQuotation = await employeePurchase(50);

    const before = await cash();
    expect(before.summary.expense).toBe(40);
    const employeeRows = before.rows.filter((row) => row.paid_by_employee_name);
    expect(employeeRows.length).toBe(2);
    expect(employeeRows.every((row) => !row.moves_cash && row.reimbursement_status === "pending")).toBe(true);

    const first = await api().put(`/employee-debt/pay/${userId}`, { amount: 60, payment_account_id: bcpId });
    expect(first.status).toBe(200);
    expect(first.body.message).toMatch(/abono/i);
    const second = await api().put(`/employee-debt/pay/${userId}`, { amount: 90, payment_account_id: yapeId });
    expect(second.status).toBe(200);
    expect(second.body.message).toMatch(/saldada/i);

    const after = await cash();
    const reimbursements = after.rows.filter((row) => row.source === "employee_debt_payment");
    expect(reimbursements.map((row) => [row.amount, row.payment_account_id]).sort()).toEqual(
      [
        [60, bcpId],
        [90, yapeId],
      ].sort()
    );
    expect(after.summary.expense).toBe(190);
    expect(after.summary.by_account.find((row) => row.payment_account_id === bcpId)?.expense).toBe(100);
    expect(after.summary.by_account.find((row) => row.payment_account_id === yapeId)?.expense).toBe(90);
    expect(await pendingOf(userId)).toBe(0);

    // FIFO: la deuda más antigua (100) recibió 60 del primer abono y 40 del
    // segundo; la otra (50), el resto del segundo. Por cotización, cada
    // reposición muestra solo su parte.
    const firstParts = (await cash(`&quotationId=${firstQuotation}`)).rows
      .filter((row) => row.source === "employee_debt_payment")
      .map((row) => row.amount)
      .sort((a, b) => a - b);
    expect(firstParts).toEqual([40, 60]);
    const secondParts = (await cash(`&quotationId=${secondQuotation}`)).rows.filter(
      (row) => row.source === "employee_debt_payment"
    );
    expect(secondParts.map((row) => [row.amount, row.reimbursement_total])).toEqual([[50, 90]]);
  });

  it("no deja reponer de más ni con más de 2 decimales", async () => {
    expect((await api().put(`/employee-debt/pay/${userId}`, { amount: 1 })).status).toBe(400);
    await employeePurchase(20);
    expect((await api().put(`/employee-debt/pay/${userId}`, { amount: 20.001 })).status).toBe(400);
    expect((await api().put(`/employee-debt/pay/${userId}`, { amount: 25 })).status).toBe(400);
    expect(await pendingOf(userId)).toBe(20);
  });

  it("anular una reposición la saca de Caja y devuelve la deuda a pendiente; no se anula dos veces", async () => {
    const paid = await api().put(`/employee-debt/pay/${userId}`, { amount: 20 });
    expect(paid.status).toBe(200);
    const paymentId: number = paid.body.data.id;
    expect(await pendingOf(userId)).toBe(0);

    const voided = await api().put(`/employee-debt/payment/disable/${paymentId}`);
    expect(voided.status).toBe(200);
    expect(await pendingOf(userId)).toBe(20);
    const { rows } = await cash("&source=employee_debt_payment");
    expect(rows.some((row) => row.source_id === paymentId)).toBe(false);

    const again = await api().put(`/employee-debt/payment/disable/${paymentId}`);
    expect(again.status).toBe(409);

    const history = await api().get(`/employee-debt/payments?userId=${userId}`);
    expect(history.body.data.data.find((row: { id: number }) => row.id === paymentId)?.is_deleted).toBe(true);

    expect((await api().put(`/employee-debt/pay/${userId}`, { amount: 20 })).status).toBe(200);
  });

  describe("Deuda manual (el trabajador pagó un servicio con su plata)", () => {
    const manualDebt = (overrides: Record<string, unknown> = {}) =>
      api().post("/employee-debt/create", {
        user_id: userId,
        description: `Pago de luz ${wordStamp().slice(0, 6)}`,
        category: "pago_servicios",
        amount: 85.5,
        incurred_at: limaDate(),
        ...overrides,
      });

    it("queda como deuda y en Caja se ve, pero no mueve caja", async () => {
      const { summary: before } = await cash();
      const created = await manualDebt();
      expect(created.status).toBe(201);
      expect(await pendingOf(userId)).toBe(85.5);

      const { rows, summary } = await cash("&source=employee_debt");
      const row = rows.find((item) => item.source_id === created.body.data.id);
      expect(row?.moves_cash).toBe(false);
      expect(row?.paid_by_employee_name).toBeTruthy();
      expect(summary.expense).toBe(0);
      expect((await cash()).summary.expense).toBe(before.expense);

      const cancelled = await api().put(`/employee-debt/disable/${created.body.data.id}`);
      expect(cancelled.status).toBe(200);
      expect(await pendingOf(userId)).toBe(0);
    });

    it("bloquea el doble envío del mismo formulario", async () => {
      const description = `Agua ${wordStamp().slice(0, 6)}`;
      const first = await manualDebt({ description, amount: 12.3 });
      expect(first.status).toBe(201);
      const duplicate = await manualDebt({ description, amount: 12.3 });
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.code).toBe("DUPLICATE_DEBT");
      expect((await api().put(`/employee-debt/disable/${first.body.data.id}`)).status).toBe(200);
    });

    it("valida fecha, monto, categoría y que el trabajador sea de la empresa", async () => {
      expect((await manualDebt({ incurred_at: limaDate(1) })).status).toBe(400);
      expect((await manualDebt({ incurred_at: "2026-02-31" })).status).toBe(400);
      expect((await manualDebt({ amount: 10.555 })).status).toBe(400);
      expect((await manualDebt({ amount: 0 })).status).toBe(400);
      expect((await manualDebt({ category: "categoria_inventada" })).status).toBe(400);
      expect((await manualDebt({ description: "  " })).status).toBe(400);

      const foreignWorker = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).userId;
      expect((await manualDebt({ user_id: foreignWorker })).status).toBe(400);
    });

    it("solo se anula si todavía no se le repuso nada", async () => {
      const created = await manualDebt({ amount: 50 });
      const debtId: number = created.body.data.id;
      const paid = await api().put(`/employee-debt/pay/${userId}`, { amount: 30 });
      expect(paid.status).toBe(200);

      const blocked = await api().put(`/employee-debt/disable/${debtId}`);
      expect(blocked.status).toBe(409);
      expect(blocked.body.message).toMatch(/anula primero esa reposición/i);

      expect((await api().put(`/employee-debt/payment/disable/${paid.body.data.id}`)).status).toBe(200);
      expect((await api().put(`/employee-debt/disable/${debtId}`)).status).toBe(200);
      expect((await api().put(`/employee-debt/disable/${debtId}`)).status).toBe(409);
      expect(await pendingOf(userId)).toBe(0);
    });

    it("una deuda de una compra no se anula desde acá", async () => {
      const detail = await api().get(`/employee-debt/detail?userId=${userId}&status=paid`);
      const purchaseDebt = detail.body.data.data.find((row: { origin: string }) => row.origin === "purchase");
      expect(purchaseDebt).toBeDefined();
      expect((await api().put(`/employee-debt/disable/${purchaseDebt.id}`)).status).toBe(409);
    });
  });

  it("una cotización que no está aceptada no admite pagos, gastos ni órdenes de compra", async () => {
    const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId, { accepted: false });

    const payment = await api().post(`/quotation/${quotationId}/payments`, {
      amount: 10,
      method: "cash",
      paid_at: limaDate(),
    });
    expect(payment.status).toBe(409);
    expect(payment.body.code).toBe("QUOTATION_NOT_ACTIVE");

    const expense = await api().post(`/quotation/${quotationId}/expenses`, {
      description: "Gasto en pendiente",
      amount: 5,
      spent_at: limaDate(),
    });
    expect(expense.status).toBe(409);
    expect(expense.body.code).toBe("QUOTATION_NOT_ACTIVE");

    const purchaseOrder = await api().post("/purchase-order/create", {
      company_id: companyId,
      quotation_id: quotationId,
      assigned_to: userId,
      items: [{ quotation_item_id: quotationItemId, quantity: 10 }],
    });
    expect(purchaseOrder.status).toBe(409);
    expect(purchaseOrder.body.code).toBe("QUOTATION_NOT_ACTIVE");
  });

  it("un pago en efectivo nunca queda con cuenta", async () => {
    const { quotationId } = await createQuotationFixture(token, companyId);
    const res = await api().post(`/quotation/${quotationId}/payments`, {
      amount: 10,
      method: "cash",
      paid_at: limaDate(),
      payment_account_id: bcpId,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.payment_account_id).toBeNull();
  });

  it("rechaza fechas futuras o imposibles en todo lo que mueve dinero", async () => {
    const movement = await api().post("/cash-movement/create", {
      direction: "expense",
      category: "otro_egreso",
      amount: 5,
      occurred_at: limaDate(1),
    });
    expect(movement.status).toBe(400);

    const { quotationId } = await createQuotationFixture(token, companyId);
    const expense = await api().post(`/quotation/${quotationId}/expenses`, {
      description: "Fecha imposible",
      amount: 5,
      spent_at: "2026-02-31",
    });
    expect(expense.status).toBe(400);
    const payment = await api().post(`/quotation/${quotationId}/payments`, {
      amount: 5,
      method: "cash",
      paid_at: limaDate(1),
    });
    expect(payment.status).toBe(400);
  });

  it("una cuenta con movimientos no se elimina ni cambia de categoría; una sin uso sí se elimina", async () => {
    const removed = await api().delete(`/variable_general/delete/${bcpId}`);
    expect(removed.status).toBe(409);
    expect(removed.body.code).toBe("PAYMENT_ACCOUNT_IN_USE");

    const recategorized = await api().put(`/variable_general/update/${bcpId}`, { category: "otra_cosa" });
    expect(recategorized.status).toBe(400);

    const unused = await createAccount("Cuenta sin uso", "bank");
    expect((await api().delete(`/variable_general/delete/${unused}`)).status).toBe(200);
  });

  it("restaurar un pago anulado no puede dejar la cotización sobre-pagada", async () => {
    const { quotationId } = await createQuotationFixture(token, companyId);
    const total = Number((await api().get(`/quotation/find/${quotationId}`)).body.data.total);
    const big = Math.round(total * 80) / 100;
    const half = Math.round(total * 50) / 100;

    const first = await api().post(`/quotation/${quotationId}/payments`, { amount: big, method: "cash", paid_at: limaDate() });
    expect(first.status).toBe(201);
    expect((await api().put(`/payment/disable/${first.body.data.id}`)).status).toBe(200);
    const second = await api().post(`/quotation/${quotationId}/payments`, { amount: half, method: "cash", paid_at: limaDate() });
    expect(second.status).toBe(201);

    const restored = await api().put(`/payment/disable/${first.body.data.id}`);
    expect(restored.status).toBe(400);
    expect(restored.body.message).toMatch(/sobre-pagada/i);
  });

  it("el resumen de Caja abarca todo lo filtrado, no solo la página", async () => {
    const small = await api().get("/cash-movement/list?limit=2");
    const { summary } = await cash();
    expect(small.body.data.summary).toEqual(summary);
    expect(small.body.data.data.length).toBe(2);
  });

  it("Estadísticas cuentan las reposiciones como egreso, igual que Caja", async () => {
    const range = `dateFrom=${limaDate()}&dateTo=${limaDate()}`;
    const kpis = (await api().get(`/statistics/overview?${range}`)).body.data.kpis.current;
    const { summary } = await cash(`&${range}`);
    expect(kpis.expenses).toBe(summary.expense);
    expect(kpis.collected + kpis.other_income).toBe(summary.income);
  });
});
