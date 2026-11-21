import { authedRequest, login } from "./helpers/apiClient";
import { createCashClosingTestCompany, type CashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };

const todayLima = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(new Date());

interface Loan {
  id: number;
  principal: number;
  interest_rate: number;
  interest_amount: number;
  total_due: number;
  paid_amount: number;
  paid_interest: number;
  balance: number;
  status: string;
  active: boolean;
  payment_account_name: string | null;
}

interface LoanDetail extends Loan {
  payments: { id: number; amount: number; principal_part: number; interest_part: number; active: boolean }[];
}

interface CashRow {
  id: string;
  source: string;
  direction: string;
  amount: number;
  loan: { loan_id: number; part: string } | null;
}

/**
 * Préstamos a personas (pedido del usuario, 21-nov): a quién, cuánto y qué %
 * de interés (simple, una sola vez). Los cobros se reparten en capital e
 * interés en proporción; el capital mueve la caja sin ser ingreso ni egreso y
 * el interés sí es ingreso (Caja, resultado del mes). Empresa desechable.
 */
describe("Préstamos a personas", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let other: CashClosingTestCompany;
  const today = todayLima();
  const admin = () => authedRequest(ctx.admin.token);
  const find = async (id: number) => (await admin().get(`/loan/find/${id}`)).body.data as LoanDetail;
  const createLoan = (body: Record<string, unknown>) =>
    admin().post("/loan/create", { borrower_name: "Juan Pérez", loaned_at: today, ...body });
  const pay = (id: number, amount: number, extra: Record<string, unknown> = {}) =>
    admin().post(`/loan/${id}/payment`, { amount, paid_at: today, ...extra });

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    other = await createCashClosingTestCompany(superToken);
  }, 120_000);

  afterAll(async () => {
    for (const company of [ctx, other]) {
      if (company?.companyId) await authedRequest(superToken).put(`/company/disable/${company.companyId}`);
    }
  });

  it("el Gestor no tiene el módulo (403); otra empresa no ve el préstamo (404)", async () => {
    const gestor = await authedRequest(ctx.gestor.token).post("/loan/create", { borrower_name: "X", principal: 10, interest_rate: 0, loaned_at: today });
    expect(gestor.status).toBe(403);
    const created = await createLoan({ principal: 50, interest_rate: 0 });
    expect(created.status).toBe(201);
    expect((await authedRequest(other.admin.token).get(`/loan/find/${created.body.data.id}`)).status).toBe(404);
  });

  it("1000 al 10%: interés 100, se cobra en dos partes y queda pagado", async () => {
    const created = await createLoan({ principal: 1000, interest_rate: 10, payment_account_id: ctx.bankAccountId, borrower_document: "12345678" });
    expect(created.status).toBe(201);
    const loan = created.body.data as Loan;
    expect(loan).toMatchObject({ principal: 1000, interest_amount: 100, total_due: 1100, balance: 1100, status: "pending" });
    expect(loan.payment_account_name).toContain("BCP");

    expect((await pay(loan.id, 550)).status).toBe(201);
    const tooMuch = await pay(loan.id, 600);
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.code).toBe("LOAN_PAYMENT_EXCEEDS_BALANCE");
    const last = await pay(loan.id, 550, { payment_account_id: ctx.yapeAccountId, operation_number: "987" });
    expect(last.status).toBe(201);
    expect(last.body.data).toMatchObject({ balance: 0, status: "paid", paid_interest: 100 });

    const detail = await find(loan.id);
    expect(detail.payments.map((row) => [row.principal_part, row.interest_part])).toEqual([
      [500, 50],
      [500, 50],
    ]);
  });

  it("el reparto no deja céntimos sueltos: 100 al 7% en tres cobros", async () => {
    const loan = (await createLoan({ principal: 100, interest_rate: 7 })).body.data as Loan;
    expect(loan.total_due).toBe(107);
    for (const amount of [33.33, 33.33, 40.34]) expect((await pay(loan.id, amount)).status).toBe(201);
    const detail = await find(loan.id);
    const interest = detail.payments.reduce((sum, row) => sum + row.interest_part, 0);
    const principal = detail.payments.reduce((sum, row) => sum + row.principal_part, 0);
    expect(Math.round(interest * 100) / 100).toBe(7);
    expect(Math.round(principal * 100) / 100).toBe(100);
    expect(detail.balance).toBe(0);
  });

  it("en Caja: el préstamo sale, el capital vuelve sin ser ingreso y el interés es ingreso", async () => {
    const res = await admin().get(`/cash-movement/list?page=1&limit=100&source=loan&dateFrom=${today}&dateTo=${today}`);
    expect(res.status).toBe(200);
    const rows = res.body.data.data as CashRow[];
    const out = rows.filter((row) => row.loan?.part === "disbursement").reduce((sum, row) => sum + row.amount, 0);
    const capital = rows.filter((row) => row.loan?.part === "principal").reduce((sum, row) => sum + row.amount, 0);
    const interest = rows.filter((row) => row.loan?.part === "interest").reduce((sum, row) => sum + row.amount, 0);
    // 50 (primer préstamo) + 1000 + 100 prestados; devueltos 1000 + 100 de capital; intereses 100 + 7.
    expect(out).toBe(1150);
    expect(Math.round(capital * 100) / 100).toBe(1100);
    expect(Math.round(interest * 100) / 100).toBe(107);
    const summary = res.body.data.summary as { income: number; expense: number; transfers: number };
    expect(summary.income).toBe(107);
    expect(summary.expense).toBe(0);
    expect(summary.transfers).toBe(-50);

    const month = await admin().get(`/cash-movement/month-summary?period=${today.slice(0, 7)}`);
    expect(month.body.data.income).toBe(107);
    expect(month.body.data.expenses).toBe(0);
  });

  it("con cobros no se cambia el dinero ni se anula; sin cobros, sí", async () => {
    const loan = (await createLoan({ principal: 200, interest_rate: 5 })).body.data as Loan;
    expect((await pay(loan.id, 10)).status).toBe(201);
    const blocked = await admin().put(`/loan/update/${loan.id}`, { principal: 300 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("LOAN_HAS_PAYMENTS");
    expect((await admin().put(`/loan/disable/${loan.id}`)).status).toBe(409);
    // Los datos de la persona sí se corrigen siempre.
    expect((await admin().put(`/loan/update/${loan.id}`, { borrower_phone: "999888777" })).status).toBe(200);

    const detail = await find(loan.id);
    expect((await admin().put(`/loan/payment/disable/${detail.payments[0]!.id}`)).status).toBe(200);
    const corrected = await admin().put(`/loan/update/${loan.id}`, { principal: 300, interest_rate: 10 });
    expect(corrected.status).toBe(200);
    expect(corrected.body.data).toMatchObject({ principal: 300, interest_amount: 30, total_due: 330, balance: 330 });

    const annulled = await admin().put(`/loan/disable/${loan.id}`);
    expect(annulled.status).toBe(200);
    expect(annulled.body.data).toMatchObject({ active: false, status: "annulled" });
    // Anulado: ya no aparece en Caja.
    const cash = await admin().get(`/cash-movement/list?page=1&limit=100&source=loan`);
    expect((cash.body.data.data as CashRow[]).some((row) => row.loan?.loan_id === loan.id)).toBe(false);
  });

  it("el listado pagina, filtra por estado y resume lo que falta cobrar", async () => {
    const paid = await admin().get("/loan/list?page=1&limit=10&status=paid");
    expect(paid.status).toBe(200);
    expect((paid.body.data.data as Loan[]).every((row) => row.status === "paid")).toBe(true);
    const pending = await admin().get("/loan/list?page=1&limit=10&status=pending");
    // El de 50 sin cobros.
    expect(pending.body.data.summary.outstanding_balance).toBe(50);
    expect(pending.body.data.meta.total).toBe(1);
    const annulled = await admin().get("/loan/list?page=1&limit=10&status=annulled");
    expect(annulled.body.data.meta.total).toBe(1);
  });
});
