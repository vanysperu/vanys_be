import { activateInvitedUser, authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import { createPurchaseOrderFixture, createQuotationFixture, createUnscopedCompanyAdmin } from "./helpers/fixtures";
import { queryRows } from "./helpers/db";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

interface RoleTreeNode {
  id: number;
  code: string;
  children: RoleTreeNode[];
}

// Aplana el árbol de recursos de un rol para buscar un recurso por su código.
const flattenResourceTree = (modules: { resources: RoleTreeNode[] }[]): RoleTreeNode[] => {
  const walk = (nodes: RoleTreeNode[]): RoleTreeNode[] => nodes.flatMap((node) => [node, ...walk(node.children)]);
  return modules.flatMap((module) => walk(module.resources));
};

// Día de hoy en Lima (YYYY-MM-DD), desplazado `days` días.
const limaDate = (days = 0) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const [year = 0, month = 1, day = 1] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

interface CashRow {
  source: string;
  source_id: number;
  amount: number;
  moves_cash: boolean;
  payment_account_id: number | null;
  corrections_count: number;
}

interface CashSummary {
  expense: number;
  by_account: { payment_account_id: number | null; expense: number }[];
}

interface PurchaseLine {
  id: number;
  quotation_expense_id: number;
  quantity: number;
  amount: number;
  funding_source: string;
  paid_by_user_id: number | null;
  is_deleted: boolean;
  debt_id: number | null;
  debt_amount: number | null;
  debt_paid_amount: number | null;
  debt_status: string | null;
  corrections_count: number;
}

interface DebtRow {
  id: number;
  user_id: number;
  amount: string;
  paid_amount: string;
  status: string;
  incurred_at: string;
}

// Invariante del plan, en SQL: cada compra vigente pagada por un trabajador
// tiene exactamente UNA deuda vigente con el mismo monto, el mismo trabajador
// y (si `checkDates`) incurred_at = spent_at de su gasto; una compra de la
// empresa o anulada no tiene deuda vigente; el gasto refleja la compra (monto
// y anulación). Devuelve las compras que lo rompen (debe ser []).
const brokenPurchases = (companyId: number, checkDates: boolean) =>
  queryRows<{ id: number }>(
    `SELECT pop.id
     FROM purchase_order_item_purchase pop
     INNER JOIN purchase_order_item poi ON poi.id = pop.purchase_order_item_id
     INNER JOIN purchase_order po ON po.id = poi.purchase_order_id
     INNER JOIN quotation_expense qe ON qe.id = pop.quotation_expense_id
     LEFT JOIN employee_debt ed ON ed.purchase_order_item_purchase_id = pop.id AND ed.status <> 'cancelled'
     WHERE po.company_id = ?
       AND (
         qe.amount <> pop.amount
         OR qe.is_deleted <> pop.is_deleted
         OR ((pop.is_deleted = true OR pop.funding_source = 'company') AND ed.id IS NOT NULL)
         OR (pop.is_deleted = false AND pop.funding_source = 'employee' AND (
               ed.id IS NULL OR ed.amount <> pop.amount OR ed.user_id <> pop.paid_by_user_id
               OR (? = 1 AND ed.incurred_at <> qe.spent_at)))
       )`,
    [companyId, checkDates ? 1 : 0]
  );

/**
 * Corregir y anular gastos de cotización y compras de órdenes de compra.
 * Todo corre en una empresa QA nueva (nunca producción): los totales de Caja
 * se comparan con valores exactos y la integridad compra = gasto = deuda se
 * revisa con SQL directo después de cada escenario.
 */
describe("Corrección y anulación de gastos y compras", () => {
  let superToken: string;
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
  const accountExpense = (summary: CashSummary, accountId: number | null) =>
    summary.by_account.find((row) => row.payment_account_id === accountId)?.expense ?? 0;
  const createAccount = async (name: string, prefix: "bank" | "yape") => {
    const res = await api().post("/variable_general/create", {
      category: "payment_account",
      title: "Cuenta",
      prefix_id: prefix,
      name,
      ref1: "987654321",
      company_id: companyId,
    });
    expect(res.status).toBe(200);
    return res.body.data.id as number;
  };
  // Otro trabajador activo de la misma empresa (para cambiar quién pagó).
  const createWorker = async () => (await createUnscopedCompanyAdmin(superToken, companyId)).userId;

  const createExpense = async (quotationId: number, overrides: Record<string, unknown> = {}) => {
    const res = await api().post(`/quotation/${quotationId}/expenses`, {
      description: `Gasto a corregir ${wordStamp().slice(0, 6)}`,
      amount: 100,
      spent_at: limaDate(-1),
      payment_account_id: bcpId,
      ...overrides,
    });
    expect(res.status).toBe(201);
    return res.body.data.id as number;
  };

  // Cotización + orden (10 unidades) + una compra.
  const createPurchase = async (body: Record<string, unknown>) => {
    const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
    const { purchaseOrderId, itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId);
    const res = await api().post(`/purchase-order/item/${itemId}/purchases`, { quantity: 10, amount: 100, ...body });
    expect(res.status).toBe(201);
    return { quotationId, purchaseOrderId, itemId, purchaseId: res.body.data.id as number };
  };
  const findPurchase = async (purchaseId: number) => {
    const res = await api().get(`/purchase-order/purchase/find/${purchaseId}`);
    expect(res.status).toBe(200);
    return res.body.data as PurchaseLine & { quotation_id: number };
  };
  const purchaseOrder = async (purchaseOrderId: number) => {
    const res = await api().get(`/purchase-order/find/${purchaseOrderId}`);
    expect(res.status).toBe(200);
    return res.body.data as { status: string; items: { status: string; purchases: PurchaseLine[] }[] };
  };
  const correctPurchase = (purchaseId: number, body: Record<string, unknown>) =>
    api().put(`/purchase-order/purchase/update/${purchaseId}`, { reason: "Corrección de prueba", ...body });
  const debtsOfPurchase = (purchaseId: number) =>
    queryRows<DebtRow>(
      `SELECT id, user_id, amount, paid_amount, status, DATE_FORMAT(incurred_at, '%Y-%m-%d') AS incurred_at
       FROM employee_debt WHERE purchase_order_item_purchase_id = ?`,
      [purchaseId]
    );
  // Alguna corrección de la compra guardó la foto de la deuda (antes/después).
  const purchaseHistoryHasDebtSnapshot = async (purchaseId: number) => {
    const res = await api().get(`/purchase-order/purchase/${purchaseId}/corrections?page=1&limit=50`);
    expect(res.status).toBe(200);
    return (res.body.data.data as { new_values: Record<string, unknown> }[]).some(
      (entry) => "debt_status" in entry.new_values && "debt_amount" in entry.new_values
    );
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const company = await authedRequest(superToken).post("/company/create", {
      ruc: `207${Date.now().toString().slice(-8)}`,
      business_name: `PurchFix ${wordStamp().slice(0, 8)}`,
    });
    companyId = company.body.data.id;
    const admin = await createUnscopedCompanyAdmin(superToken, companyId);
    token = admin.token;
    userId = admin.userId;
    bcpId = await createAccount("BCP Compras", "bank");
    yapeId = await createAccount("Yape Compras", "yape");
  });

  // Después de cada escenario, el invariante compra = gasto = deuda se cumple.
  afterEach(async () => {
    expect(await brokenPurchases(companyId, true)).toEqual([]);
  });

  describe("Gasto manual de una cotización", () => {
    it("corregir monto y cuenta mueve Caja por cuenta y deja historial", async () => {
      const { quotationId } = await createQuotationFixture(token, companyId);
      const expenseId = await createExpense(quotationId);
      const before = (await cash()).summary;

      const res = await api().put(`/quotation/expense/update/${expenseId}`, {
        amount: 80,
        payment_account_id: yapeId,
        reason: "Se tipeó mal el monto y la cuenta",
      });
      expect(res.status).toBe(200);
      expect(res.body.data.changed_fields.sort()).toEqual(["amount", "payment_account_id"]);

      const after = (await cash()).summary;
      expect(Math.round((before.expense - after.expense) * 100) / 100).toBe(20);
      expect(Math.round((accountExpense(before, bcpId) - accountExpense(after, bcpId)) * 100) / 100).toBe(100);
      expect(Math.round((accountExpense(after, yapeId) - accountExpense(before, yapeId)) * 100) / 100).toBe(80);

      const history = await api().get(`/quotation/expense/${expenseId}/corrections?page=1&limit=10`);
      expect(history.status).toBe(200);
      expect(history.body.data.meta.total).toBe(1);
      const [entry] = history.body.data.data;
      expect(entry.previous_values).toMatchObject({ amount: 100, payment_account_id: bcpId, payment_account_name: "BCP Compras" });
      expect(entry.new_values).toMatchObject({ amount: 80, payment_account_id: yapeId, payment_account_name: "Yape Compras" });

      const found = await api().get(`/quotation/expense/find/${expenseId}`);
      expect(found.body.data).toMatchObject({ amount: 80, payment_account_id: yapeId, corrections_count: 1, purchase_id: null });
      const detail = await api().get(`/quotation/find/${quotationId}`);
      const listed = detail.body.data.expenses.find((row: { id: number }) => row.id === expenseId);
      expect(listed).toMatchObject({ corrections_count: 1, is_deleted: false, purchase_id: null });
      const cashRow = (await cash(`&quotationId=${quotationId}`)).rows.find(
        (row) => row.source === "quotation_expense" && row.source_id === expenseId
      );
      expect(cashRow?.corrections_count).toBe(1);
    });

    it("sin cambios, sin motivo o cambiando la cotización se rechaza", async () => {
      const { quotationId } = await createQuotationFixture(token, companyId);
      const expenseId = await createExpense(quotationId);

      const noChanges = await api().put(`/quotation/expense/update/${expenseId}`, { amount: 100, reason: "Nada cambia acá" });
      expect(noChanges.status).toBe(400);
      expect(noChanges.body.code).toBe("NO_CHANGES");
      expect((await api().put(`/quotation/expense/update/${expenseId}`, { amount: 50, reason: "x" })).status).toBe(400);
      expect((await api().put(`/quotation/expense/update/${expenseId}`, { amount: 50 })).status).toBe(400);
      expect(
        (await api().put(`/quotation/expense/update/${expenseId}`, { quotation_id: quotationId, reason: "Mover de cotización" }))
          .status
      ).toBe(400);
      expect((await api().put(`/quotation/expense/update/${expenseId}`, { amount: 0, reason: "Monto en cero" })).status).toBe(400);
      expect(
        (await api().put(`/quotation/expense/update/${expenseId}`, { spent_at: limaDate(1), reason: "Fecha futura" })).status
      ).toBe(400);
    });

    it("anular lo saca de Caja; anulado no se corrige; restaurar lo devuelve", async () => {
      const { quotationId } = await createQuotationFixture(token, companyId);
      const expenseId = await createExpense(quotationId, { amount: 33 });
      const isListed = async () =>
        (await cash(`&quotationId=${quotationId}`)).rows.some(
          (row) => row.source === "quotation_expense" && row.source_id === expenseId
        );
      expect(await isListed()).toBe(true);

      const annulled = await api().put(`/quotation/expense/disable/${expenseId}`);
      expect(annulled.status).toBe(200);
      expect(annulled.body.data.is_deleted).toBe(true);
      expect(await isListed()).toBe(false);

      const blocked = await api().put(`/quotation/expense/update/${expenseId}`, { amount: 30, reason: "Corregir un anulado" });
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe("EXPENSE_ANNULLED");
      const detail = await api().get(`/quotation/find/${quotationId}`);
      expect(detail.body.data.expenses.find((row: { id: number }) => row.id === expenseId)?.is_deleted).toBe(true);

      const restored = await api().put(`/quotation/expense/disable/${expenseId}`);
      expect(restored.status).toBe(200);
      expect(restored.body.data.is_deleted).toBe(false);
      expect(await isListed()).toBe(true);
    });

    it("el gasto de una compra no se corrige ni se anula como gasto", async () => {
      const { purchaseId } = await createPurchase({ funding_source: "company", payment_account_id: bcpId });
      const { quotation_expense_id: expenseId } = await findPurchase(purchaseId);

      const corrected = await api().put(`/quotation/expense/update/${expenseId}`, { amount: 5, reason: "Tocar la compra" });
      expect(corrected.status).toBe(409);
      expect(corrected.body.code).toBe("EXPENSE_BELONGS_TO_PURCHASE");
      const toggled = await api().put(`/quotation/expense/disable/${expenseId}`);
      expect(toggled.status).toBe(409);
      expect(toggled.body.code).toBe("EXPENSE_BELONGS_TO_PURCHASE");

      const found = await api().get(`/quotation/expense/find/${expenseId}`);
      expect(found.body.data.purchase_id).toBe(purchaseId);
    });

    it("un gasto de otra empresa responde 404", async () => {
      const { quotationId } = await createQuotationFixture(token, companyId);
      const expenseId = await createExpense(quotationId);
      const foreign = authedRequest((await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token);
      // 404 exacto por alcance (no 403): el admin de la otra empresa SÍ tiene
      // los recursos RBAC (lo confirma money-correction-rbac.test.ts), así que un
      // 403 aquí escondería un hueco de alcance.
      expect((await foreign.get(`/quotation/expense/find/${expenseId}`)).status).toBe(404);
      expect((await foreign.put(`/quotation/expense/update/${expenseId}`, { amount: 1, reason: "Gasto ajeno" })).status).toBe(404);
      expect((await foreign.put(`/quotation/expense/disable/${expenseId}`)).status).toBe(404);
    });
  });

  describe("Compra de una orden de compra", () => {
    it("bajar la cantidad reabre el item; subirla de más exige confirmación", async () => {
      const { purchaseOrderId, purchaseId } = await createPurchase({ funding_source: "company" });
      expect((await purchaseOrder(purchaseOrderId)).items[0]?.status).toBe("purchased");

      const lowered = await correctPurchase(purchaseId, { quantity: 6 });
      expect(lowered.status).toBe(200);
      const afterLower = await purchaseOrder(purchaseOrderId);
      expect(afterLower.items[0]?.status).toBe("pending");
      expect(afterLower.status).toBe("pending");
      const { quotation_expense_id: expenseId } = await findPurchase(purchaseId);
      const expense = (await api().get(`/quotation/expense/find/${expenseId}`)).body.data;
      expect(expense.description).toMatch(/x6/);

      const exceeded = await correctPurchase(purchaseId, { quantity: 12 });
      expect(exceeded.status).toBe(409);
      expect(exceeded.body.code).toBe("PURCHASE_EXCEEDS_REMAINING");
      expect(exceeded.body.errors).toMatchObject({ ordered: 10, already_purchased: 0, requested: 12 });

      const confirmed = await correctPurchase(purchaseId, { quantity: 12, allow_exceed: true });
      expect(confirmed.status).toBe(200);
      const afterRaise = await purchaseOrder(purchaseOrderId);
      expect(afterRaise.items[0]?.status).toBe("purchased");
      expect(afterRaise.status).toBe("purchased");
      expect((await api().get(`/quotation/expense/find/${expenseId}`)).body.data.description).toMatch(
        /x12 \(compra adicional: 2 por encima de lo pedido\)/
      );

      const purchase = await findPurchase(purchaseId);
      expect(purchase.corrections_count).toBe(2);
      const history = await api().get(`/purchase-order/purchase/${purchaseId}/corrections?page=1&limit=10`);
      expect(history.body.data.meta.total).toBe(2);
    });

    it("pasar una compra de la empresa de banco a efectivo (cuenta null explícita) la deja sin cuenta y mueve Caja", async () => {
      const round2 = (value: number) => Math.round(value * 100) / 100;
      const { quotationId, purchaseId } = await createPurchase({ funding_source: "company", payment_account_id: bcpId });
      const { quotation_expense_id: expenseId } = await findPurchase(purchaseId);
      const cashRow = async () =>
        (await cash(`&quotationId=${quotationId}`)).rows.find((row) => row.source === "quotation_expense");
      expect((await cashRow())?.payment_account_id).toBe(bcpId);

      // 1) Solo la cuenta: bcp → efectivo.
      const before = (await cash()).summary;
      const toCash = await correctPurchase(purchaseId, { payment_account_id: null });
      expect(toCash.status).toBe(200);
      expect(toCash.body.data.changed_fields).toEqual(["payment_account_id"]);
      const expense = (await api().get(`/quotation/expense/find/${expenseId}`)).body.data;
      expect(expense.payment_account_id).toBeNull();
      expect((await cashRow())?.payment_account_id).toBeNull();
      const after = (await cash()).summary;
      expect(round2(accountExpense(before, bcpId) - accountExpense(after, bcpId))).toBe(100);
      expect(round2(accountExpense(after, null) - accountExpense(before, null))).toBe(100);
      expect(round2(after.expense - before.expense)).toBe(0);

      const history = await api().get(`/purchase-order/purchase/${purchaseId}/corrections?page=1&limit=10`);
      expect(history.body.data.meta.total).toBe(1);
      const [entry] = history.body.data.data;
      expect(entry.previous_values).toMatchObject({ payment_account_id: bcpId, payment_account_name: "BCP Compras" });
      expect(entry.new_values).toMatchObject({ payment_account_id: null });

      // 2) Misma corrección junto con el monto, sobre otra compra.
      const second = await createPurchase({ funding_source: "company", payment_account_id: bcpId });
      const secondExpenseId = (await findPurchase(second.purchaseId)).quotation_expense_id;
      const beforeBoth = (await cash()).summary;
      const both = await correctPurchase(second.purchaseId, { payment_account_id: null, amount: 80 });
      expect(both.status).toBe(200);
      expect([...both.body.data.changed_fields].sort()).toEqual(["amount", "payment_account_id"]);
      expect((await api().get(`/quotation/expense/find/${secondExpenseId}`)).body.data.payment_account_id).toBeNull();
      const afterBoth = (await cash()).summary;
      expect(round2(accountExpense(beforeBoth, bcpId) - accountExpense(afterBoth, bcpId))).toBe(100);
      expect(round2(accountExpense(afterBoth, null) - accountExpense(beforeBoth, null))).toBe(80);
    });

    it("empresa → trabajador → empresa → trabajador: la deuda se crea, se anula y se reactiva (una sola fila)", async () => {
      const worker = await createWorker();
      const { quotationId, purchaseId } = await createPurchase({ funding_source: "company", payment_account_id: bcpId });
      const cashRow = async () =>
        (await cash(`&quotationId=${quotationId}`)).rows.find((row) => row.source === "quotation_expense");

      const withAccount = await correctPurchase(purchaseId, { funding_source: "employee", payment_account_id: bcpId });
      expect(withAccount.status).toBe(400);
      expect(withAccount.body.code).toBe("PAYMENT_ACCOUNT_NOT_ALLOWED");
      const foreignWorker = (await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).userId;
      const foreign = await correctPurchase(purchaseId, { funding_source: "employee", paid_by_user_id: foreignWorker });
      expect(foreign.status).toBe(400);
      expect(foreign.body.code).toBe("EMPLOYEE_NOT_AVAILABLE");

      const toEmployee = await correctPurchase(purchaseId, { funding_source: "employee", paid_by_user_id: worker });
      expect(toEmployee.status).toBe(200);
      let debts = await debtsOfPurchase(purchaseId);
      expect(debts).toHaveLength(1);
      expect(debts[0]).toMatchObject({ user_id: worker, status: "pending" });
      expect(Number(debts[0]?.amount)).toBe(100);
      const debtId = debts[0]?.id;
      expect((await cashRow())?.moves_cash).toBe(false);
      expect((await cashRow())?.payment_account_id).toBeNull();

      const toCompany = await correctPurchase(purchaseId, { funding_source: "company", payment_account_id: yapeId });
      expect(toCompany.status).toBe(200);
      debts = await debtsOfPurchase(purchaseId);
      expect(debts.map((debt) => [debt.id, debt.status])).toEqual([[debtId, "cancelled"]]);
      expect((await cashRow())?.moves_cash).toBe(true);
      expect((await cashRow())?.payment_account_id).toBe(yapeId);

      const backToEmployee = await correctPurchase(purchaseId, {
        funding_source: "employee",
        paid_by_user_id: worker,
        amount: 90,
        spent_at: limaDate(-2),
      });
      expect(backToEmployee.status).toBe(200);
      debts = await debtsOfPurchase(purchaseId);
      expect(debts).toHaveLength(1);
      expect(debts[0]).toMatchObject({ id: debtId, user_id: worker, status: "pending", incurred_at: limaDate(-2) });
      expect(Number(debts[0]?.amount)).toBe(90);

      // Sin nada repuesto, se puede cambiar de trabajador.
      const reassigned = await correctPurchase(purchaseId, { paid_by_user_id: userId });
      expect(reassigned.status).toBe(200);
      expect((await debtsOfPurchase(purchaseId))[0]?.user_id).toBe(userId);
      expect(await purchaseHistoryHasDebtSnapshot(purchaseId)).toBe(true);
    });

    it("con parte ya repuesta: no baja de lo repuesto, no cambia quién pagó y no se anula", async () => {
      const worker = await createWorker();
      const { purchaseId } = await createPurchase({ funding_source: "employee", paid_by_user_id: worker });
      const paid = await api().put(`/employee-debt/pay/${worker}`, { amount: 40 });
      expect(paid.status).toBe(200);
      const reimbursementId: number = paid.body.data.id;

      const below = await correctPurchase(purchaseId, { amount: 30 });
      expect(below.status).toBe(409);
      expect(below.body.code).toBe("DEBT_BELOW_REIMBURSED");
      const toCompany = await correctPurchase(purchaseId, { funding_source: "company" });
      expect(toCompany.status).toBe(409);
      expect(toCompany.body.code).toBe("PURCHASE_DEBT_REIMBURSED");
      const otherWorker = await correctPurchase(purchaseId, { paid_by_user_id: userId });
      expect(otherWorker.status).toBe(409);
      expect(otherWorker.body.code).toBe("PURCHASE_DEBT_REIMBURSED");
      const annul = await api().put(`/purchase-order/purchase/disable/${purchaseId}`);
      expect(annul.status).toBe(409);
      expect(annul.body.code).toBe("PURCHASE_DEBT_REIMBURSED");

      // Igual a lo repuesto: la deuda queda pagada.
      const equal = await correctPurchase(purchaseId, { amount: 40 });
      expect(equal.status).toBe(200);
      let [debt] = await debtsOfPurchase(purchaseId);
      expect(debt?.status).toBe("paid");
      expect(Number(debt?.paid_amount)).toBe(40);

      // Subirla vuelve a dejar saldo pendiente.
      expect((await correctPurchase(purchaseId, { amount: 55 })).status).toBe(200);
      [debt] = await debtsOfPurchase(purchaseId);
      expect(debt?.status).toBe("pending");
      expect(Number(debt?.amount)).toBe(55);

      // Anulada la reposición, ya se puede anular la compra.
      expect((await api().put(`/employee-debt/payment/disable/${reimbursementId}`)).status).toBe(200);
      expect((await api().put(`/purchase-order/purchase/disable/${purchaseId}`)).status).toBe(200);
      [debt] = await debtsOfPurchase(purchaseId);
      expect(debt?.status).toBe("cancelled");
    });

    it("anular: saca la compra de Caja, reabre el item, no se repite y no bloquea cancelar la cotización", async () => {
      const { quotationId, purchaseOrderId, itemId, purchaseId } = await createPurchase({
        funding_source: "company",
        payment_account_id: bcpId,
      });
      const { quotation_expense_id: expenseId } = await findPurchase(purchaseId);
      const before = (await cash()).summary;

      const annulled = await api().put(`/purchase-order/purchase/disable/${purchaseId}`);
      expect(annulled.status).toBe(200);
      const after = (await cash()).summary;
      expect(Math.round((before.expense - after.expense) * 100) / 100).toBe(100);
      expect(Math.round((accountExpense(before, bcpId) - accountExpense(after, bcpId)) * 100) / 100).toBe(100);

      const order = await purchaseOrder(purchaseOrderId);
      expect(order.items[0]?.status).toBe("pending");
      expect(order.status).toBe("pending");
      expect(order.items[0]?.purchases.find((line) => line.id === purchaseId)?.is_deleted).toBe(true);
      const detail = await api().get(`/quotation/find/${quotationId}`);
      expect(detail.body.data.expenses.find((row: { id: number }) => row.id === expenseId)?.is_deleted).toBe(true);

      const again = await api().put(`/purchase-order/purchase/disable/${purchaseId}`);
      expect(again.status).toBe(409);
      expect(again.body.code).toBe("PURCHASE_ANNULLED");
      const corrected = await correctPurchase(purchaseId, { amount: 5 });
      expect(corrected.status).toBe(409);
      expect(corrected.body.code).toBe("PURCHASE_ANNULLED");

      // Una compra anulada ya no es plata gastada: el item se puede marcar
      // "ya no es necesario" y la cotización se puede cancelar.
      expect((await api().put(`/purchase-order/item/${itemId}/status`, { status: "not_needed" })).status).toBe(200);
      expect((await api().put(`/quotation/status/${quotationId}`, { status: "cancelled" })).status).toBe(200);
    });

    it("una compra anulada no cuenta para lo que falta comprar", async () => {
      const { itemId, purchaseId } = await createPurchase({ funding_source: "company", quantity: 6 });
      expect((await api().put(`/purchase-order/purchase/disable/${purchaseId}`)).status).toBe(200);
      // Faltan otra vez las 10: comprar 10 no pide confirmación.
      const res = await api().post(`/purchase-order/item/${itemId}/purchases`, { quantity: 10, amount: 20, funding_source: "company" });
      expect(res.status).toBe(201);
    });
  });

  describe("Alcance de escritura (decisión 4)", () => {
    let gestor: ReturnType<typeof authedRequest>;
    let ownStore: number;
    let otherStore: number;
    // Dinero ya registrado por el admin en cada tienda.
    let otherStorePurchaseId: number;
    let ownStorePurchaseId: number;
    let otherStoreReimbursementId: number;
    let ownStoreReimbursementId: number;
    let otherStoreQuotationId: number;
    let ownStoreQuotationId: number;

    // Cotización aceptada (un item) en la tienda indicada, creada por el admin sin tienda.
    const createStoreQuotation = async (businessUnitId: number) => {
      const stamp = wordStamp();
      const client = await api().post("/client/create", { company_id: companyId, name: `ScopeClient${stamp}` });
      const product = await api().post("/product/create", { company_id: companyId, name: `ScopeProduct${stamp}`, price_unit: 10 });
      const quotation = await api().post("/quotation/create", {
        company_id: companyId,
        client_id: client.body.data.id,
        business_unit_id: businessUnitId,
        items: [{ product_id: product.body.data.id, quantity: 5, pricing_mode: "unit" }],
      });
      expect(quotation.status).toBe(201);
      const quotationId: number = quotation.body.data.id;
      expect((await api().put(`/quotation/status/${quotationId}`, { status: "accepted" })).status).toBe(200);
      const detail = await api().get(`/quotation/find/${quotationId}`);
      return { quotationId, quotationItemId: detail.body.data.items[0].id as number };
    };

    // Orden + una compra de la empresa en la tienda indicada.
    const createStorePurchase = async (businessUnitId: number) => {
      const { quotationId, quotationItemId } = await createStoreQuotation(businessUnitId);
      const { itemId } = await createPurchaseOrderFixture(token, companyId, userId, quotationId, quotationItemId, 5);
      const res = await api().post(`/purchase-order/item/${itemId}/purchases`, {
        quantity: 5,
        amount: 40,
        funding_source: "company",
        payment_account_id: bcpId,
      });
      expect(res.status).toBe(201);
      return res.body.data.id as number;
    };

    // Deuda manual en la tienda indicada, para un trabajador nuevo, ya repuesta por completo.
    const createStoreReimbursement = async (businessUnitId: number) => {
      const worker = await createWorker();
      const debt = await api().post("/employee-debt/create", {
        user_id: worker,
        description: `Deuda de tienda ${wordStamp().slice(0, 8)}`,
        category: "pago_servicios",
        amount: 20,
        incurred_at: limaDate(-5),
        business_unit_id: businessUnitId,
      });
      expect(debt.status).toBe(201);
      const paid = await api().put(`/employee-debt/pay/${worker}`, { amount: 20 });
      expect(paid.status).toBe(200);
      return paid.body.data.id as number;
    };

    beforeAll(async () => {
      // OJO: se reutiliza el login único del Super Administrador (superToken);
      // un segundo login del mismo usuario invalidaría el token ya emitido.
      const superApi = authedRequest(superToken);
      const createStore = async (code: string) => {
        const res = await superApi.post("/business-unit/create", { company_id: companyId, business_code: `${code}-${wordStamp().slice(0, 6)}` });
        expect(res.status).toBeLessThan(300);
        return res.body.data.id as number;
      };
      ownStore = await createStore("OWN");
      otherStore = await createStore("OTHER");

      // El rol plantilla Gestor NO tiene "ver todas las tiendas": se arma un
      // rol propio con ese permiso y los botones que se van a probar (así el
      // 404/403 que se mide es de ALCANCE, no de RBAC ni de lectura).
      const role = await superApi.post("/role/create", {
        name: `ScopeRole${wordStamp().slice(0, 8)}`,
        description: "Gestor de prueba con ver todas las tiendas",
        company_id: companyId,
      });
      expect(role.status).toBe(200);
      const roleId: number = role.body.data.id;
      const fullTree = await superApi.get("/roles/1/resources");
      const nodes = flattenResourceTree(fullTree.body.data.modules);
      const wanted = [
        "roles_access.viewAllBusinessUnits.button",
        "cotizacion.payment.create.button",
        "cotizacion.expense.create.button",
        "purchase_order.purchase.update.button",
        "purchase_order.purchase.disable.button",
        "employee_debt.payment.update.button",
      ].map((code) => nodes.find((node) => node.code === code)?.id);
      expect(wanted.every((id) => id !== undefined)).toBe(true);
      const saved = await superApi.put(`/roles/${roleId}/resources`, { resourceIds: { add: wanted, remove: [] } });
      expect(saved.status).toBe(200);

      // Gestor ligado a SU tienda con ese rol.
      const email = `gestor.scope.${wordStamp()}@acme.test`;
      const created = await superApi.post("/user/create", {
        name: "Gestor",
        paternal_lastname: "Scope",
        document_type: 1,
        document_number: `${Date.now()}`.slice(-8),
        date_of_birth: "01/01/1990",
        email,
        status: true,
        gender: 4,
        company_id: companyId,
        business_unit_id: ownStore,
        roleIds: roleId,
      });
      expect(created.status).toBe(200);
      gestor = authedRequest((await activateInvitedUser(created.body, email, "Test1234")).token);

      otherStoreQuotationId = (await createStoreQuotation(otherStore)).quotationId;
      ownStoreQuotationId = (await createStoreQuotation(ownStore)).quotationId;
      otherStorePurchaseId = await createStorePurchase(otherStore);
      ownStorePurchaseId = await createStorePurchase(ownStore);
      otherStoreReimbursementId = await createStoreReimbursement(otherStore);
      ownStoreReimbursementId = await createStoreReimbursement(ownStore);
    });

    it("crear pagos y gastos: en otra tienda 403 STORE_WRITE_SCOPE; en la suya, bien", async () => {
      const expense = await gestor.post(`/quotation/${otherStoreQuotationId}/expenses`, {
        description: "Ajeno",
        amount: 5,
        spent_at: limaDate(),
      });
      expect(expense.status).toBe(403);
      expect(expense.body.code).toBe("STORE_WRITE_SCOPE");
      const payment = await gestor.post(`/quotation/${otherStoreQuotationId}/payments`, { amount: 5, method: "cash", paid_at: limaDate() });
      expect(payment.status).toBe(403);
      expect(payment.body.code).toBe("STORE_WRITE_SCOPE");

      const detail = await api().get(`/quotation/find/${otherStoreQuotationId}`);
      expect(detail.body.data.expenses).toHaveLength(0);
      expect(detail.body.data.payments).toHaveLength(0);

      // Control: en su propia tienda sí puede (el 403 de arriba es de alcance).
      const ownExpense = await gestor.post(`/quotation/${ownStoreQuotationId}/expenses`, {
        description: "Propio",
        amount: 5,
        spent_at: limaDate(),
      });
      expect(ownExpense.status).toBe(201);
      const ownPayment = await gestor.post(`/quotation/${ownStoreQuotationId}/payments`, { amount: 5, method: "cash", paid_at: limaDate() });
      expect(ownPayment.status).toBe(201);
    });

    it("corregir y anular una compra de otra tienda responde 404; en la suya, bien", async () => {
      const corrected = await gestor.put(`/purchase-order/purchase/update/${otherStorePurchaseId}`, {
        amount: 41,
        reason: "Intento en tienda ajena",
      });
      expect(corrected.status).toBe(404);
      const annulled = await gestor.put(`/purchase-order/purchase/disable/${otherStorePurchaseId}`);
      expect(annulled.status).toBe(404);
      // Sigue intacta.
      const intact = await findPurchase(otherStorePurchaseId);
      expect(Number(intact.amount)).toBe(40);
      expect(intact.is_deleted).toBe(false);

      // Control: la de su tienda sí la corrige.
      const own = await gestor.put(`/purchase-order/purchase/update/${ownStorePurchaseId}`, { amount: 42, reason: "Propia, corregida" });
      expect(own.status).toBe(200);
    });

    it("corregir una reposición de otra tienda responde 404; en la suya, bien", async () => {
      const foreign = await gestor.put(`/employee-debt/payment/update/${otherStoreReimbursementId}`, {
        amount: 15,
        reason: "Intento en tienda ajena",
      });
      expect(foreign.status).toBe(404);

      // Control: la de su tienda sí la corrige (baja el monto).
      const own = await gestor.put(`/employee-debt/payment/update/${ownStoreReimbursementId}`, {
        amount: 15,
        reason: "Propia, corregida",
      });
      expect(own.status).toBe(200);
    });
  });

  it("integridad compra = gasto = deuda en la empresa QA compartida", async () => {
    const qaCompanyId = (
      await authedRequest((await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token).get("/access/me")
    ).body.data.companyId as number;
    // Sin la regla de fechas: compras viejas (antes de fijar spent_at al día
    // de Lima) pueden tener el gasto un día corrido respecto de la deuda.
    expect(await brokenPurchases(qaCompanyId, false)).toEqual([]);
  });
});
