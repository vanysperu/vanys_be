import { authedRequest, login, QA_COMPANY_ADMIN, wordStamp } from "./helpers/apiClient";
import { createQuotationFixture, createUnscopedCompanyAdmin } from "./helpers/fixtures";
import { queryRows } from "./helpers/db";

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
  amount: number;
  payment_account_id: number | null;
  corrections_count: number;
}

interface CorrectionRow {
  source_type: string;
  source_id: number;
  previous_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  reason: string;
  created_by: number;
}

interface PaymentRow {
  id: number;
  amount: number;
  is_deleted: boolean;
  corrections_count: number;
}

/**
 * Corregir un pago de cliente (PUT /payment/update/:id) con historial
 * inmutable. Empresa QA nueva para comparar con valores exactos. Total de la
 * cotización del fixture: S/ 250 (10 u. x (20 + 5)).
 */
describe("Corrección de pagos", () => {
  let token: string;
  let userId: number;
  let companyId: number;
  let bcpId: number;
  let yapeId: number;

  const api = () => authedRequest(token);

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

  // Cotización aceptada nueva + un pago con el monto/cuenta indicados.
  const paidQuotation = async (amount: number, overrides: Record<string, unknown> = {}) => {
    const { quotationId } = await createQuotationFixture(token, companyId);
    const res = await api().post(`/quotation/${quotationId}/payments`, {
      amount,
      method: "transfer",
      operation_number: "OP-1",
      paid_at: limaDate(-1),
      payment_account_id: bcpId,
      ...overrides,
    });
    expect(res.status).toBe(201);
    return { quotationId, paymentId: res.body.data.id as number };
  };

  // Cuerpo completo de la corrección (contrato de /payment/update).
  const fullBody = (overrides: Record<string, unknown>) => ({
    amount: 100,
    method: "transfer",
    operation_number: "OP-1",
    paid_at: limaDate(-1),
    payment_account_id: bcpId,
    notes: null,
    reason: "Corrección de prueba del pago",
    ...overrides,
  });

  const correct = (paymentId: number, overrides: Record<string, unknown>) =>
    api().put(`/payment/update/${paymentId}`, fullBody(overrides));

  const totalPaid = async (quotationId: number) =>
    Number((await api().get(`/quotation/find/${quotationId}`)).body.data.total_paid);

  const balanceInReceivables = async (quotationId: number) => {
    const res = await api().get("/receivable/list?limit=100&orderBy=created_at&orderDir=desc");
    expect(res.status).toBe(200);
    const row = (res.body.data.data as { quotation_id: number; balance: number }[]).find(
      (item) => item.quotation_id === quotationId
    );
    return row?.balance;
  };

  const cashRows = async (quotationId: number) => {
    const res = await api().get(`/cash-movement/list?limit=100&quotationId=${quotationId}&source=quotation_payment`);
    expect(res.status).toBe(200);
    return res.body.data as { data: CashRow[]; summary: { income: number; by_account: { payment_account_id: number | null; income: number }[] } };
  };

  beforeAll(async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    const company = await authedRequest(superToken).post("/company/create", {
      ruc: `205${Date.now().toString().slice(-8)}`,
      business_name: `PayFixCo ${wordStamp().slice(0, 8)}`,
    });
    companyId = company.body.data.id;
    const admin = await createUnscopedCompanyAdmin(superToken, companyId);
    token = admin.token;
    userId = admin.userId;
    bcpId = await createAccount("BCP Pagos", "bank");
    yapeId = await createAccount("Yape Pagos", "yape");
  });

  it("bajar el monto recalcula total_paid, el saldo por cobrar y Caja, y deja historial", async () => {
    const { quotationId, paymentId } = await paidQuotation(200);
    expect(await totalPaid(quotationId)).toBe(200);
    expect(await balanceInReceivables(quotationId)).toBe(50);

    const res = await correct(paymentId, { amount: 120.5, reason: "El cliente depositó menos de lo anotado" });
    expect(res.status).toBe(200);
    expect(res.body.data.changed_fields).toEqual(["amount"]);

    expect(await totalPaid(quotationId)).toBe(120.5);
    expect(await balanceInReceivables(quotationId)).toBe(129.5);

    // Caja: una sola fila, con el monto nuevo y el badge.
    const cash = await cashRows(quotationId);
    const row = cash.data.find((item) => item.source_id === paymentId);
    expect(cash.data.filter((item) => item.source_id === paymentId).length).toBe(1);
    expect(row?.amount).toBe(120.5);
    expect(row?.corrections_count).toBe(1);

    // Historial del propio módulo.
    const history = await api().get(`/payment/${paymentId}/corrections?page=1&limit=20`);
    expect(history.status).toBe(200);
    const [entry] = history.body.data.data as CorrectionRow[];
    expect(entry?.source_type).toBe("quotation_payment");
    expect(entry?.previous_values).toEqual({ amount: 200 });
    expect(entry?.new_values).toEqual({ amount: 120.5 });
    expect(entry?.reason).toBe("El cliente depositó menos de lo anotado");
    expect(entry?.created_by).toBe(userId);

    // Mismo historial desde el endpoint genérico de Caja.
    const generic = await api().get(`/cash-movement/${paymentId}/corrections?source=quotation_payment`);
    expect(generic.status).toBe(200);
    expect(generic.body.data.meta.total).toBe(1);

    // La corrección dejó su log y el evento de la cotización con el motivo.
    const logs = await queryRows<{ description: string }>(
      "SELECT description FROM `log` WHERE module = ? AND action = ? AND description LIKE ?",
      ["payment", "UPDATE", `%#${paymentId} (%`]
    );
    expect(logs.length).toBe(1);
    const events = await queryRows<{ description: string }>(
      "SELECT description FROM quotation_event WHERE quotation_id = ? AND action = ?",
      [quotationId, "payment_updated"]
    );
    expect(events.some((event) => event.description.includes("El cliente depositó menos"))).toBe(true);
  });

  it("subir el monto por encima del saldo es 400 PAYMENT_EXCEEDS_BALANCE; hasta el saldo exacto sí", async () => {
    const { quotationId, paymentId } = await paidQuotation(100);

    // 250.02 y no 250.01: el saldo admite 1 céntimo de tolerancia por redondeo
    // del IGV (OVERPAY_TOLERANCE en quotation_payment.service.ts).
    const over = await correct(paymentId, { amount: 250.02 });
    expect(over.status).toBe(400);
    expect(over.body.code).toBe("PAYMENT_EXCEEDS_BALANCE");
    expect(over.body.message).toMatch(/sobre-pagada/i);
    expect(await totalPaid(quotationId)).toBe(100);

    // Crear otro pago que se pasa del saldo tiene el mismo código.
    const tooMuch = await api().post(`/quotation/${quotationId}/payments`, {
      amount: 151,
      method: "cash",
      paid_at: limaDate(-1),
    });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.code).toBe("PAYMENT_EXCEEDS_BALANCE");

    expect((await correct(paymentId, { amount: 250 })).status).toBe(200);
    expect(await totalPaid(quotationId)).toBe(250);
    expect(await balanceInReceivables(quotationId)).toBeUndefined(); // saldo 0: ya no está por cobrar
  });

  it("un pago anulado es 409 PAYMENT_ANNULLED; restaurado, se puede corregir", async () => {
    const { quotationId, paymentId } = await paidQuotation(80);
    expect((await api().put(`/payment/disable/${paymentId}`)).status).toBe(200);
    expect(await totalPaid(quotationId)).toBe(0);

    const res = await correct(paymentId, { amount: 90 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PAYMENT_ANNULLED");

    expect((await api().put(`/payment/disable/${paymentId}`)).status).toBe(200);
    expect((await correct(paymentId, { amount: 90 })).status).toBe(200);
    expect(await totalPaid(quotationId)).toBe(90);
  });

  it("efectivo y banco: pasar a efectivo fuerza cuenta nula; salir de efectivo exige cuenta", async () => {
    const { quotationId, paymentId } = await paidQuotation(60);

    // A efectivo aunque llegue la cuenta: se descarta.
    const toCash = await correct(paymentId, {
      method: "cash",
      operation_number: null,
      payment_account_id: bcpId,
      reason: "Fue en efectivo, no por transferencia",
    });
    expect(toCash.status).toBe(200);
    let row = (await cashRows(quotationId)).data.find((item) => item.source_id === paymentId);
    expect(row?.payment_account_id).toBeNull();

    // De efectivo a Yape sin cuenta: la empresa tiene cuentas -> requerida.
    const noAccount = await correct(paymentId, {
      method: "yape",
      operation_number: "Y-77",
      payment_account_id: null,
      reason: "Pasó por Yape",
    });
    expect(noAccount.status).toBe(400);
    expect(noAccount.body.code).toBe("PAYMENT_ACCOUNT_REQUIRED");

    const withAccount = await correct(paymentId, {
      method: "yape",
      operation_number: "Y-77",
      payment_account_id: yapeId,
      reason: "Pasó por Yape",
    });
    expect(withAccount.status).toBe(200);
    row = (await cashRows(quotationId)).data.find((item) => item.source_id === paymentId);
    expect(row?.payment_account_id).toBe(yapeId);
    expect(row?.corrections_count).toBe(2);
  });

  it("cambiar la cuenta mueve el ingreso de una cuenta a la otra sin cambiar el total", async () => {
    const { quotationId, paymentId } = await paidQuotation(75);
    const before = await cashRows(quotationId);

    expect((await correct(paymentId, { amount: 75, payment_account_id: yapeId, method: "yape", operation_number: "Y-1" })).status).toBe(200);

    const after = await cashRows(quotationId);
    const incomeOf = (summary: typeof after.summary, accountId: number) =>
      summary.by_account.find((account) => account.payment_account_id === accountId)?.income ?? 0;
    expect(after.summary.income).toBe(before.summary.income);
    expect(incomeOf(after.summary, bcpId)).toBe(0);
    expect(incomeOf(after.summary, yapeId)).toBe(75);
  });

  it("sin motivo, con motivo corto o sin cambios es 400 (NO_CHANGES con código) y no deja historial", async () => {
    const { paymentId } = await paidQuotation(50);

    expect((await api().put(`/payment/update/${paymentId}`, { ...fullBody({ amount: 51 }), reason: undefined })).status).toBe(400);
    expect((await correct(paymentId, { amount: 51, reason: "abc" })).status).toBe(400);
    expect((await correct(paymentId, { amount: 51, reason: "x".repeat(501) })).status).toBe(400);

    const noChanges = await correct(paymentId, { amount: 50 });
    expect(noChanges.status).toBe(400);
    expect(noChanges.body.code).toBe("NO_CHANGES");

    const history = await api().get(`/payment/${paymentId}/corrections`);
    expect(history.body.data.meta.total).toBe(0);
  });

  it("monto inválido (0, negativo, 3 decimales) y fecha futura son 400", async () => {
    const { paymentId } = await paidQuotation(40);
    expect((await correct(paymentId, { amount: 0 })).status).toBe(400);
    expect((await correct(paymentId, { amount: -1 })).status).toBe(400);
    expect((await correct(paymentId, { amount: 10.123 })).status).toBe(400);
    expect((await correct(paymentId, { paid_at: limaDate(1) })).status).toBe(400);
  });

  it("el pago de otra empresa no se corrige ni se lee (403) y /find devuelve el pago con su saldo", async () => {
    const { quotationId, paymentId } = await paidQuotation(30);
    const foreign = authedRequest((await login(QA_COMPANY_ADMIN.email, QA_COMPANY_ADMIN.password)).token);

    expect((await foreign.put(`/payment/update/${paymentId}`, fullBody({ amount: 31 }))).status).toBe(403);
    expect((await foreign.get(`/payment/${paymentId}/corrections`)).status).toBe(403);
    expect((await foreign.get(`/payment/find/${paymentId}`)).status).toBe(403);
    expect((await foreign.get(`/cash-movement/${paymentId}/corrections?source=quotation_payment`)).status).toBe(404);
    expect(await totalPaid(quotationId)).toBe(30);

    const found = await api().get(`/payment/find/${paymentId}`);
    expect(found.status).toBe(200);
    expect(found.body.data).toMatchObject({
      id: paymentId,
      quotation_id: quotationId,
      amount: 30,
      is_deleted: false,
      quotation_total: 250,
      paid_by_others: 0,
      corrections_count: 0,
    });
  });

  it("integridad: total_paid siempre es la suma de los pagos vigentes tras varias correcciones", async () => {
    const { quotationId, paymentId } = await paidQuotation(50);
    const second = await api().post(`/quotation/${quotationId}/payments`, {
      amount: 60,
      method: "cash",
      paid_at: limaDate(-1),
    });
    expect(second.status).toBe(201);

    expect((await correct(paymentId, { amount: 70 })).status).toBe(200);
    expect((await correct(paymentId, { amount: 20 })).status).toBe(200);
    expect((await api().put(`/payment/disable/${second.body.data.id}`)).status).toBe(200);

    const list = await api().get(`/payment/list?limit=100&quotationId=${quotationId}&status=all`);
    const rows = list.body.data.data as PaymentRow[];
    const activeSum = rows.filter((row) => !row.is_deleted).reduce((sum, row) => sum + row.amount, 0);
    expect(await totalPaid(quotationId)).toBe(activeSum);
    expect(activeSum).toBe(20);
    expect(rows.find((row) => row.id === paymentId)?.corrections_count).toBe(2);
  });
});
