import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import { createPurchaseOrderFixture, createQuotationFixture, createUnscopedCompanyAdmin } from "./helpers/fixtures";
import { queryRows } from "./helpers/db";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

// Día de hoy en Lima (YYYY-MM-DD), desplazado `days` días.
const limaDate = (days = 0) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());
  const [year = 0, month = 1, day = 1] = today.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

const round2 = (value: number) => Math.round(value * 100) / 100;

interface DebtRow {
  id: number;
  origin: string;
  amount: number;
  paid_amount: number;
  status: string;
  paid_at: string | null;
  corrections_count: number;
}

interface CashRow {
  source: string;
  source_id: number;
  amount: number;
  occurred_at: string;
  payment_account_id: number | null;
  corrections_count: number;
}

interface CashSummary {
  expense: number;
  by_account: { payment_account_id: number | null; expense: number }[];
}

interface Allocation {
  employee_debt_id: number;
  amount: number;
}

interface CorrectionEntry {
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  reason: string;
}

/**
 * Corregir deudas manuales y reposiciones a trabajadores (en el lugar, con
 * historial inmutable). Todo corre en una empresa QA nueva; cada escenario
 * usa un trabajador nuevo, así el reparto FIFO/LIFO se compara con valores
 * exactos sin depender de otras pruebas.
 */
describe("Corrección de deudas con el personal y reposiciones", () => {
  let superToken: string;
  let token: string;
  let adminId: number;
  let companyId: number;
  let bcpId: number;
  let yapeId: number;

  const api = () => authedRequest(token);
  const newWorker = async () => (await createUnscopedCompanyAdmin(superToken, companyId)).userId;
  const manualDebt = async (worker: number, amount: number, overrides: Record<string, unknown> = {}) => {
    const res = await api().post("/employee-debt/create", {
      user_id: worker,
      description: `Gasto ${wordStamp().slice(0, 8)}`,
      category: "pago_servicios",
      amount,
      incurred_at: limaDate(-5),
      ...overrides,
    });
    expect(res.status).toBe(201);
    return res.body.data.id as number;
  };
  const pay = async (worker: number, amount: number, accountId: number | null = null) => {
    const res = await api().put(`/employee-debt/pay/${worker}`, { amount, payment_account_id: accountId });
    expect(res.status).toBe(200);
    return res.body.data.id as number;
  };
  const debtsOf = async (worker: number) => {
    const res = await api().get(`/employee-debt/detail?userId=${worker}&status=all&limit=50`);
    expect(res.status).toBe(200);
    return new Map((res.body.data.data as DebtRow[]).map((row) => [row.id, row]));
  };
  const allocationsOf = async (paymentId: number) => {
    const res = await api().get(`/employee-debt/payment/find/${paymentId}`);
    expect(res.status).toBe(200);
    return (res.body.data.allocations as { employee_debt_id: number; allocated_amount: number }[])
      .map((line) => ({ employee_debt_id: line.employee_debt_id, amount: line.allocated_amount }))
      .sort((left, right) => left.employee_debt_id - right.employee_debt_id);
  };
  const cash = async (query = "") => {
    const res = await api().get(`/cash-movement/list?limit=100${query}`);
    expect(res.status).toBe(200);
    return { rows: res.body.data.data as CashRow[], summary: res.body.data.summary as CashSummary };
  };
  const reimbursementRow = async (paymentId: number) =>
    (await cash("&source=employee_debt_payment")).rows.find((row) => row.source_id === paymentId);
  const expensesKpi = async () => {
    const res = await api().get(`/statistics/overview?dateFrom=${limaDate(-29)}&dateTo=${limaDate()}`);
    expect(res.status).toBe(200);
    return Number(res.body.data.kpis.current.expenses);
  };
  const correctDebt = (id: number, body: Record<string, unknown>) => api().put(`/employee-debt/update/${id}`, body);
  const correctPayment = (id: number, body: Record<string, unknown>) =>
    api().put(`/employee-debt/payment/update/${id}`, body);
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

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const company = await authedRequest(superToken).post("/company/create", {
      ruc: `207${Date.now().toString().slice(-8)}`,
      business_name: `DebtFixCo ${wordStamp().slice(0, 8)}`,
    });
    companyId = company.body.data.id;
    const admin = await createUnscopedCompanyAdmin(superToken, companyId);
    token = admin.token;
    adminId = admin.userId;
    bcpId = await createAccount("BCP Reposiciones", "bank");
    yapeId = await createAccount("Yape Reposiciones", "yape");
  });

  describe("Deuda manual", () => {
    it("no baja por debajo de lo ya repuesto; igual a lo repuesto la deja pagada", async () => {
      const worker = await newWorker();
      const debtId = await manualDebt(worker, 50);
      await pay(worker, 30);

      const below = await correctDebt(debtId, { amount: 20, reason: "El recibo era por menos" });
      expect(below.status).toBe(409);
      expect(below.body.code).toBe("DEBT_BELOW_REIMBURSED");

      const equal = await correctDebt(debtId, { amount: 30, reason: "El recibo era de S/ 30" });
      expect(equal.status).toBe(200);
      expect(equal.body.data.changed_fields).toEqual(["amount"]);
      const debt = (await debtsOf(worker)).get(debtId);
      expect(debt?.status).toBe("paid");
      expect(debt?.paid_amount).toBe(30);
      expect(debt?.corrections_count).toBe(1);

      // Subirla otra vez la vuelve a pendiente (lo repuesto no cambia).
      expect((await correctDebt(debtId, { amount: 45, reason: "Faltaba sumar la mora" })).status).toBe(200);
      expect((await debtsOf(worker)).get(debtId)?.status).toBe("pending");

      const history = await api().get(`/employee-debt/${debtId}/corrections?page=1&limit=10`);
      expect(history.status).toBe(200);
      const [latest] = history.body.data.data as CorrectionEntry[];
      expect(latest?.previous_values).toEqual({ amount: 30, debt_status: "paid" });
      expect(latest?.new_values).toEqual({ amount: 45, debt_status: "pending" });
    });

    it("el trabajador solo se cambia mientras no se le haya repuesto nada", async () => {
      const worker = await newWorker();
      const other = await newWorker();
      const debtId = await manualDebt(worker, 40);

      const moved = await correctDebt(debtId, { user_id: other, reason: "Lo pagó otra persona" });
      expect(moved.status).toBe(200);
      expect((await debtsOf(other)).has(debtId)).toBe(true);

      await pay(other, 10);
      const blocked = await correctDebt(debtId, { user_id: worker, reason: "Era el primero en realidad" });
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe("DEBT_REIMBURSED");
    });

    it("valida motivo, cambios, fecha y categoría", async () => {
      const worker = await newWorker();
      const debtId = await manualDebt(worker, 25);
      expect((await correctDebt(debtId, { amount: 26, reason: "no" })).status).toBe(400);
      const noChanges = await correctDebt(debtId, { amount: 25, reason: "Sin cambios reales" });
      expect(noChanges.status).toBe(400);
      expect(noChanges.body.code).toBe("NO_CHANGES");
      expect((await correctDebt(debtId, { incurred_at: limaDate(1), reason: "Fecha futura" })).status).toBe(400);
      expect((await correctDebt(debtId, { category: "otro_ingreso", reason: "Categoría de ingreso" })).status).toBe(400);
      expect((await correctDebt(debtId, { description: "Luz de octubre corregida", reason: "Faltaba el mes" })).status).toBe(200);
    });

    it("una deuda anulada no se corrige", async () => {
      const worker = await newWorker();
      const debtId = await manualDebt(worker, 15);
      expect((await api().put(`/employee-debt/disable/${debtId}`)).status).toBe(200);
      const res = await correctDebt(debtId, { amount: 16, reason: "Ya estaba anulada" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("DEBT_CANCELLED");
    });

    it("una deuda de una compra se corrige desde la compra", async () => {
      const { quotationId, quotationItemId } = await createQuotationFixture(token, companyId);
      const { itemId } = await createPurchaseOrderFixture(token, companyId, adminId, quotationId, quotationItemId);
      const purchase = await api().post(`/purchase-order/item/${itemId}/purchases`, {
        quantity: 10,
        amount: 33,
        funding_source: "employee",
      });
      expect(purchase.status).toBe(201);
      const purchaseDebt = [...(await debtsOf(adminId)).values()].find(
        (row) => row.origin === "purchase" && row.amount === 33 && row.status === "pending"
      );
      expect(purchaseDebt).toBeDefined();
      const res = await correctDebt(Number(purchaseDebt?.id), { amount: 30, reason: "Se corrige desde la compra" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("DEBT_FROM_PURCHASE");
    });

    it("no se ve ni se corrige desde otra empresa", async () => {
      const worker = await newWorker();
      const debtId = await manualDebt(worker, 12);
      const foreign = await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password);
      expect((await authedRequest(foreign.token).get(`/employee-debt/find/${debtId}`)).status).toBe(404);
      const res = await authedRequest(foreign.token).put(`/employee-debt/update/${debtId}`, {
        amount: 13,
        reason: "Intento desde otra empresa",
      });
      // 404 exacto: el alcance responde como si no existiera; un 403 de RBAC
      // taparía un hueco de alcance.
      expect(res.status).toBe(404);
    });
  });

  describe("Reposición", () => {
    it("bajar el monto achica el reparto desde la deuda más nueva (LIFO) y Caja/Estadísticas cuadran", async () => {
      const worker = await newWorker();
      const debtA = await manualDebt(worker, 100);
      const debtB = await manualDebt(worker, 50);
      const debtC = await manualDebt(worker, 30);
      const paymentId = await pay(worker, 180, bcpId);
      expect(await allocationsOf(paymentId)).toEqual([
        { employee_debt_id: debtA, amount: 100 },
        { employee_debt_id: debtB, amount: 50 },
        { employee_debt_id: debtC, amount: 30 },
      ]);
      const cashBefore = (await cash()).summary.expense;
      const kpiBefore = await expensesKpi();

      const res = await correctPayment(paymentId, { amount: 120, reason: "Se le transfirió S/ 120, no S/ 180" });
      expect(res.status).toBe(200);
      expect(res.body.data.changed_fields).toEqual(["amount"]);

      // C (la más nueva) sale del reparto, B baja a 20, A no se toca.
      const expected: Allocation[] = [
        { employee_debt_id: debtA, amount: 100 },
        { employee_debt_id: debtB, amount: 20 },
      ];
      expect(res.body.data.allocations).toEqual(expected);
      expect(await allocationsOf(paymentId)).toEqual(expected);

      const debts = await debtsOf(worker);
      expect([debts.get(debtA)?.paid_amount, debts.get(debtA)?.status]).toEqual([100, "paid"]);
      expect([debts.get(debtB)?.paid_amount, debts.get(debtB)?.status]).toEqual([20, "pending"]);
      expect([debts.get(debtC)?.paid_amount, debts.get(debtC)?.status, debts.get(debtC)?.paid_at]).toEqual([
        0,
        "pending",
        null,
      ]);

      // Caja: la fila de la reposición vale la suma de su reparto, una sola vez.
      const row = await reimbursementRow(paymentId);
      expect(row?.amount).toBe(120);
      expect(row?.corrections_count).toBe(1);
      expect(round2((await cash()).summary.expense - cashBefore)).toBe(-60);
      expect(round2((await expensesKpi()) - kpiBefore)).toBe(-60);

      // Historial con el reparto antes y después.
      const history = await api().get(`/employee-debt/payment/${paymentId}/corrections?page=1&limit=10`);
      expect(history.status).toBe(200);
      const [entry] = history.body.data.data as CorrectionEntry[];
      expect(entry?.previous_values).toEqual({
        amount: 180,
        allocations: [
          { employee_debt_id: debtA, amount: 100 },
          { employee_debt_id: debtB, amount: 50 },
          { employee_debt_id: debtC, amount: 30 },
        ],
      });
      expect(entry?.new_values).toEqual({ amount: 120, allocations: expected });
    });

    it("subir el monto completa primero las deudas que ya cubre y después las demás (FIFO); más que lo pendiente → 400", async () => {
      const worker = await newWorker();
      const debtA = await manualDebt(worker, 100);
      const debtB = await manualDebt(worker, 50);
      const debtC = await manualDebt(worker, 30);
      const paymentId = await pay(worker, 120);
      // FIFO al reponer: A 100, B 20.
      expect(await allocationsOf(paymentId)).toEqual([
        { employee_debt_id: debtA, amount: 100 },
        { employee_debt_id: debtB, amount: 20 },
      ]);

      const raised = await correctPayment(paymentId, { amount: 170, reason: "Faltó sumar un segundo depósito" });
      expect(raised.status).toBe(200);
      expect(await allocationsOf(paymentId)).toEqual([
        { employee_debt_id: debtA, amount: 100 },
        { employee_debt_id: debtB, amount: 50 },
        { employee_debt_id: debtC, amount: 20 },
      ]);
      const debts = await debtsOf(worker);
      expect(debts.get(debtB)?.status).toBe("paid");
      expect([debts.get(debtC)?.paid_amount, debts.get(debtC)?.status]).toEqual([20, "pending"]);

      // Lo pendiente total es 180: 181 no se puede.
      const tooMuch = await correctPayment(paymentId, { amount: 181, reason: "Monto mayor a lo que se debe" });
      expect(tooMuch.status).toBe(400);
      expect(tooMuch.body.code).toBe("REIMBURSEMENT_EXCEEDS_PENDING");
      expect((await reimbursementRow(paymentId))?.amount).toBe(170);

      // Exactamente lo pendiente sí: todas quedan pagadas.
      expect((await correctPayment(paymentId, { amount: 180, reason: "Se le devolvió todo" })).status).toBe(200);
      const paidAll = await debtsOf(worker);
      expect([debtA, debtB, debtC].map((id) => paidAll.get(id)?.status)).toEqual(["paid", "paid", "paid"]);
    });

    it("cambiar fecha y cuenta mueve la fila de Caja de día y de cuenta, y recalcula la fecha de pago de las deudas", async () => {
      const worker = await newWorker();
      const debtId = await manualDebt(worker, 40, { incurred_at: limaDate(-10) });
      const paymentId = await pay(worker, 40, bcpId);
      const before = (await cash()).summary;
      const accountExpense = (summary: CashSummary, accountId: number) =>
        summary.by_account.find((row) => row.payment_account_id === accountId)?.expense ?? 0;

      const res = await correctPayment(paymentId, {
        paid_at: limaDate(-3),
        payment_account_id: yapeId,
        reason: "Fue por Yape y hace tres días",
      });
      expect(res.status).toBe(200);
      expect(res.body.data.changed_fields).toEqual(["paid_at", "payment_account_id"]);

      const row = await reimbursementRow(paymentId);
      expect(row?.occurred_at).toBe(limaDate(-3));
      expect(row?.payment_account_id).toBe(yapeId);
      const after = (await cash()).summary;
      expect(after.expense).toBe(before.expense);
      expect(round2(accountExpense(after, bcpId) - accountExpense(before, bcpId))).toBe(-40);
      expect(round2(accountExpense(after, yapeId) - accountExpense(before, yapeId))).toBe(40);
      expect((await debtsOf(worker)).get(debtId)?.paid_at).toBe(limaDate(-3));

      // Fecha futura o cuenta inexistente → 400/404; el trabajador no se corrige.
      expect((await correctPayment(paymentId, { paid_at: limaDate(1), reason: "Fecha futura" })).status).toBe(400);
      expect((await correctPayment(paymentId, { payment_account_id: 999999999, reason: "Cuenta inexistente" })).status).toBe(
        404
      );
      expect((await correctPayment(paymentId, { user_id: adminId, reason: "Otro trabajador" })).status).toBe(400);
    });

    it("una reposición anulada no se corrige; anular devuelve exactamente lo que cubría", async () => {
      const worker = await newWorker();
      const debtA = await manualDebt(worker, 60);
      const debtB = await manualDebt(worker, 40);
      const first = await pay(worker, 70);
      const second = await pay(worker, 30);

      expect((await api().put(`/employee-debt/payment/disable/${first}`)).status).toBe(200);
      const debts = await debtsOf(worker);
      // first cubría A 60 + B 10; second sigue cubriendo B 30.
      expect([debts.get(debtA)?.paid_amount, debts.get(debtA)?.status]).toEqual([0, "pending"]);
      expect([debts.get(debtB)?.paid_amount, debts.get(debtB)?.status]).toEqual([30, "pending"]);

      const res = await correctPayment(first, { amount: 50, reason: "Ya estaba anulada" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("REIMBURSEMENT_ANNULLED");
      expect((await api().put(`/employee-debt/payment/disable/${first}`)).status).toBe(409);
      expect(second).toBeGreaterThan(first);
    });
  });

  // Integridad de lo cacheado, desde la base: para las empresas QA usadas,
  // lo repuesto de cada deuda vigente = Σ asignaciones de reposiciones
  // vigentes, y cada reposición vigente = Σ sus asignaciones.
  it("integridad: paid_amount = Σ asignaciones vigentes y monto de reposición = Σ su reparto", async () => {
    const qaCompanyId = (await authedRequest((await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token).get(
      "/access/me"
    )).body.data.companyId as number;
    const companies = [companyId, qaCompanyId];

    const badDebts = await queryRows<{ id: number }>(
      `SELECT ed.id
       FROM employee_debt ed
       WHERE ed.company_id IN (?) AND ed.status <> 'cancelled'
         AND (ed.paid_amount <> (
               SELECT COALESCE(SUM(a.amount), 0)
               FROM employee_debt_payment_allocation a
               INNER JOIN employee_debt_payment p ON p.id = a.employee_debt_payment_id
               WHERE a.employee_debt_id = ed.id AND p.is_deleted = false)
           OR (ed.status = 'paid') <> (ed.paid_amount >= ed.amount))`,
      [companies]
    );
    expect(badDebts).toEqual([]);

    const badPayments = await queryRows<{ id: number }>(
      `SELECT p.id
       FROM employee_debt_payment p
       WHERE p.company_id IN (?) AND p.is_deleted = false
         AND p.amount <> (SELECT COALESCE(SUM(a.amount), 0) FROM employee_debt_payment_allocation a WHERE a.employee_debt_payment_id = p.id)`,
      [companies]
    );
    expect(badPayments).toEqual([]);
  });
});
