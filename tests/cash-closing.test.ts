import { authedRequest, login, wordStamp } from "./helpers/apiClient";
import { CashClosingTestCompany, createCashClosingTestCompany, createQuotationFixture } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const SETUP_TIMEOUT = 300_000;

// ---------------------------------------------------------------------------
// Fechas (día calendario de Lima). Inicio de la caja = hace dos meses (P1);
// P2 = mes anterior (terminado); CUR = mes actual (no terminado); P0 = antes
// del inicio (pre-ledger).
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
const CUR = TODAY.slice(0, 7);
const P1 = shiftPeriod(CUR, -2);
const P2 = shiftPeriod(CUR, -1);
const P0 = shiftPeriod(CUR, -3);
const day = (period: string, value: number): string => `${period}-${String(value).padStart(2, "0")}`;
const startOf = (period: string): string => `${period}-01`;

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

interface PeriodBalance {
  account_key: number;
  payment_account_id: number | null;
  account_name: string;
  opening: number;
  income: number;
  expense: number;
  adjustments: number;
  closing: number;
}

interface PeriodDetail {
  period: string;
  status: "open" | "closed" | "reopened";
  closable: boolean;
  is_preview: boolean;
  is_provisional: boolean;
  close_count: number;
  totals: { opening: number; income: number; expense: number; adjustments: number; closing: number } | null;
  balances: PeriodBalance[];
  blockers: { code: string; message: string }[];
  warnings: { code: string; message: string }[];
  counts: { adjustments_posted: number; adjustments_affecting: number };
}

interface BalanceAccount {
  account_key: number;
  base_balance: number;
  current_balance: number;
}

interface BalancesResponse {
  started: boolean;
  base_period: string | null;
  base_label: string | null;
  provisional_note: string | null;
  accounts: BalanceAccount[];
}

interface OpeningAccount {
  account_key: number;
  payment_account_id: number | null;
  amount: number | null;
  history_amount: number;
}

const keyOf = (paymentAccountId: number | null): number => paymentAccountId ?? 0;

/**
 * Cierre mensual de caja — módulo cash_closing (plan §4/§5, WP-A).
 *
 * Empresa DESECHABLE (createCashClosingTestCompany): los cierres no se pueden
 * borrar, así que nunca se toca "Acme Corp QA". Las pruebas son una sola
 * historia en orden (cada una depende de la anterior).
 *
 * Invariantes revisados:
 *   - I1: Caja del mes cerrado (toda la empresa) = foto guardada;
 *   - I2: cierre = inicial + ingresos − egresos + ajustes; inicial(P) = cierre(P−1);
 *         inicial(inicio) = saldo declarado;
 *   - I4: saldo actual = saldo declarado + Σ neto de Caja desde el inicio;
 *   - I5: re-cerrar no cambia ingresos/egresos/ajustes de otros meses cerrados.
 */
describe("Cierre de caja (cash_closing)", () => {
  let superToken: string;
  let ctx: CashClosingTestCompany;
  let unusedAccountId: number;
  let quotationId: number;
  let p1PaymentId: number;
  let p2DetailBeforeReopen: PeriodDetail;

  const admin = () => authedRequest(ctx.admin.token);
  const gestor = () => authedRequest(ctx.gestor.token);
  const superApi = () => authedRequest(superToken);

  const getData = async <T>(path: string): Promise<T> => {
    const res = await admin().get(path);
    expect(res.status).toBe(200);
    return res.body.data as T;
  };

  const cashSummary = async (query: string): Promise<CashSummary> =>
    (await getData<{ summary: CashSummary }>(`/cash-movement/list?limit=1${query}`)).summary;

  const detailOf = (period: string) => getData<PeriodDetail>(`/cash-closing/find/${period}`);

  const createPayment = async (body: Record<string, unknown>) =>
    admin().post(`/quotation/${quotationId}/payments`, {
      amount: 10,
      method: "transfer",
      operation_number: "OP-CIERRE",
      paid_at: TODAY,
      payment_account_id: ctx.bankAccountId,
      ...body,
    });

  const createMovement = async (body: Record<string, unknown>) => {
    const res = await admin().post("/cash-movement/create", {
      direction: "income",
      category: "otro_ingreso",
      amount: 10,
      description: `Cierre ${wordStamp().slice(0, 6)}`,
      occurred_at: TODAY,
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body.data.id as number;
  };

  // I1: lo que muestra Caja para el mes (toda la empresa) = foto guardada.
  const expectI1 = async (period: string) => {
    const detail = await detailOf(period);
    expect(detail.status).toBe("closed");
    const summary = await cashSummary(`&dateFrom=${startOf(period)}&dateTo=${lastDayOf(period)}`);
    const balances = new Map(detail.balances.map((row) => [row.account_key, row]));
    for (const flow of summary.by_account) {
      const stored = balances.get(keyOf(flow.payment_account_id));
      expect(stored).toBeDefined();
      expect(stored?.income).toBe(money(flow.income));
      expect(stored?.expense).toBe(money(flow.expense));
      expect(stored?.adjustments).toBe(money(flow.adjustments));
    }
    const flowKeys = new Set(summary.by_account.map((flow) => keyOf(flow.payment_account_id)));
    for (const row of detail.balances.filter((balance) => !flowKeys.has(balance.account_key))) {
      expect([row.income, row.expense, row.adjustments]).toEqual([0, 0, 0]);
    }
  };

  // I2 dentro de un mes: cierre = inicial + ingresos − egresos + ajustes.
  const expectEquation = (detail: PeriodDetail) => {
    for (const row of detail.balances) {
      expect(row.closing).toBe(money(row.opening + row.income - row.expense + row.adjustments));
    }
  };

  // I2 entre meses: inicial(P) = cierre(P−1) por cuenta.
  const expectChained = (previous: PeriodDetail, next: PeriodDetail) => {
    const closings = new Map(previous.balances.map((row) => [row.account_key, row.closing]));
    for (const row of next.balances) expect(row.opening).toBe(closings.get(row.account_key) ?? 0);
  };

  // I4: saldo actual = saldo declarado + Σ neto de Caja desde el inicio.
  const expectI4 = async () => {
    const balances = await getData<BalancesResponse>("/cash-closing/balances");
    const opening = await getData<{ start_date: string; accounts: OpeningAccount[] }>("/cash-closing/opening");
    const declared = new Map(opening.accounts.map((row) => [row.account_key, row.amount ?? 0]));
    const summary = await cashSummary(`&dateFrom=${opening.start_date}`);
    const nets = new Map(summary.by_account.map((row) => [keyOf(row.payment_account_id), row.net]));
    const keys = new Set([...balances.accounts.map((row) => row.account_key), ...nets.keys()]);
    for (const key of keys) {
      const current = balances.accounts.find((row) => row.account_key === key)?.current_balance ?? 0;
      expect(current).toBe(money((declared.get(key) ?? 0) + (nets.get(key) ?? 0)));
    }
    return balances;
  };

  beforeAll(async () => {
    superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);
    const account = await admin().post("/variable_general/create", {
      category: "payment_account",
      title: "Cuenta",
      prefix_id: "bank",
      name: `Sin uso ${wordStamp().slice(0, 6)}`,
      ref1: "123",
      company_id: ctx.companyId,
    });
    expect(account.status).toBe(200);
    unusedAccountId = account.body.data.id;
    quotationId = (await createQuotationFixture(ctx.admin.token, ctx.companyId)).quotationId;
    // Historia ANTES del inicio (pre-ledger): pista del saldo inicial.
    await createMovement({ amount: 100, occurred_at: day(P0, 15) });
  }, SETUP_TIMEOUT);

  it("sin caja configurada: estado vacío, sin saldos y no se puede cerrar", async () => {
    const status = await getData<{ started: boolean; closed_periods: string[] }>("/cash-closing/status");
    expect(status.started).toBe(false);
    expect(status.closed_periods).toEqual([]);

    const list = await admin().get("/cash-closing/list");
    expect(list.status).toBe(200);
    expect(list.body.data.data).toEqual([]);
    expect(list.body.data.meta.total).toBe(0);

    expect((await getData<BalancesResponse>("/cash-closing/balances")).started).toBe(false);

    const close = await admin().put(`/cash-closing/close/${P1}`, {});
    expect(close.status).toBe(409);
    expect(close.body.code).toBe("CASH_LEDGER_NOT_STARTED");

    // Sugerido: el último mes terminado; la pista suma lo registrado antes.
    const opening = await getData<{ started: boolean; start_period: string; accounts: OpeningAccount[] }>(
      `/cash-closing/opening?startPeriod=${P1}`
    );
    expect(opening.started).toBe(false);
    const cash = opening.accounts.find((row) => row.account_key === 0);
    expect(cash?.amount).toBeNull();
    expect(cash?.history_amount).toBe(100);
  });

  it("el Super Administrador tiene que elegir la empresa", async () => {
    const withoutCompany = await superApi().get("/cash-closing/status");
    expect(withoutCompany.status).toBe(400);
    expect(withoutCompany.body.code).toBe("COMPANY_REQUIRED");
    expect((await superApi().get(`/cash-closing/status?companyId=${ctx.companyId}`)).status).toBe(200);
    expect((await superApi().get(`/cash-closing/list?companyId=${ctx.companyId}`)).status).toBe(200);

    const put = await superApi().put("/cash-closing/opening", {
      start_period: P1,
      openings: [{ payment_account_id: null, amount: 1 }],
    });
    expect(put.status).toBe(400);
  });

  it("el gestor (atado a una tienda) solo puede leer /status", async () => {
    expect((await gestor().get("/cash-closing/status")).status).toBe(200);
    const reads = [
      "/cash-closing/list",
      "/cash-closing/balances",
      "/cash-closing/opening",
      `/cash-closing/find/${P1}`,
      `/cash-closing/${P1}/adjustments?type=posted`,
      `/cash-closing/${P1}/events`,
    ];
    for (const path of reads) expect((await gestor().get(path)).status).toBe(403);
    expect((await gestor().put(`/cash-closing/close/${P1}`, {})).status).toBe(403);
    expect((await gestor().put("/cash-closing/opening", { start_period: P1, openings: [{ payment_account_id: null, amount: 1 }] })).status).toBe(403);
  });

  it("saldo inicial: valida mes y cuentas; se guarda y se puede cambiar el mes mientras no hay cierres", async () => {
    const future = await admin().put("/cash-closing/opening", {
      start_period: shiftPeriod(CUR, 1),
      openings: [{ payment_account_id: null, amount: 1 }],
    });
    expect(future.status).toBe(400);
    expect(future.body.code).toBe("CASH_START_PERIOD_INVALID");

    const duplicated = await admin().put("/cash-closing/opening", {
      start_period: P1,
      openings: [
        { payment_account_id: null, amount: 1 },
        { payment_account_id: null, amount: 2 },
      ],
    });
    expect(duplicated.status).toBe(400);

    const foreign = await admin().put("/cash-closing/opening", {
      start_period: P1,
      openings: [{ payment_account_id: 999999999, amount: 1 }],
    });
    expect(foreign.status).toBe(403);

    // Primero en P2 y luego se corrige a P1 (sin meses cerrados, se puede).
    const first = await admin().put("/cash-closing/opening", {
      start_period: P2,
      openings: [{ payment_account_id: null, amount: 1 }],
    });
    expect(first.status).toBe(200);
    expect(first.body.data.start_period).toBe(P2);

    const saved = await admin().put("/cash-closing/opening", {
      start_period: P1,
      openings: [
        { payment_account_id: null, amount: 500 },
        { payment_account_id: ctx.bankAccountId, amount: 1000 },
        { payment_account_id: unusedAccountId, amount: 0 },
      ],
      notes: "Conteo de caja y estado de cuenta",
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.started).toBe(true);
    expect(saved.body.data.start_period).toBe(P1);
    expect(saved.body.data.editable).toBe(true);
    expect(saved.body.data.start_period_editable).toBe(true);
    const accounts = saved.body.data.accounts as OpeningAccount[];
    expect(accounts.find((row) => row.account_key === 0)?.amount).toBe(500);
    expect(accounts.find((row) => row.account_key === 0)?.history_amount).toBe(100);
    expect(accounts.find((row) => row.account_key === ctx.bankAccountId)?.amount).toBe(1000);

    const status = await getData<{ started: boolean; start_period: string }>("/cash-closing/status");
    expect(status).toMatchObject({ started: true, start_period: P1 });

    // Lista: desde el inicio hasta el mes actual, más reciente primero.
    const list = await getData<{ data: { period: string; status: string; closable: boolean }[] }>("/cash-closing/list");
    expect(list.data.map((row) => row.period)).toEqual([CUR, P2, P1]);
    expect(list.data.find((row) => row.period === P1)?.closable).toBe(true);
    expect(list.data.find((row) => row.period === P2)?.closable).toBe(false);
  });

  it("movimientos del mes de inicio y del siguiente (todavía abiertos)", async () => {
    const payment = await createPayment({ amount: 100, paid_at: day(P1, 10) });
    expect(payment.status).toBe(201);
    p1PaymentId = payment.body.data.id;
    await createMovement({ direction: "expense", category: "otro_egreso", amount: 50, occurred_at: day(P1, 20) });
    expect((await createPayment({ amount: 30, paid_at: day(P2, 5), payment_account_id: ctx.yapeAccountId })).status).toBe(201);
    await createMovement({ amount: 20, occurred_at: day(P2, 15) });

    // Vista previa de P1: saldo inicial declarado + lo del mes.
    const preview = await detailOf(P1);
    expect(preview.is_preview).toBe(true);
    expect(preview.closable).toBe(true);
    expect(preview.blockers).toEqual([]);
    const cash = preview.balances.find((row) => row.account_key === 0);
    const bank = preview.balances.find((row) => row.account_key === ctx.bankAccountId);
    expect(cash).toMatchObject({ opening: 500, income: 0, expense: 50, closing: 450 });
    expect(bank).toMatchObject({ opening: 1000, income: 100, closing: 1100 });
    expect(preview.totals?.closing).toBe(1550);
  });

  it("cada validación del cierre responde su código", async () => {
    const before = await admin().put(`/cash-closing/close/${P0}`, {});
    expect(before.status).toBe(400);
    expect(before.body.code).toBe("CASH_PERIOD_BEFORE_START");

    const notEnded = await admin().put(`/cash-closing/close/${CUR}`, {});
    expect(notEnded.status).toBe(409);
    expect(notEnded.body.code).toBe("CASH_PERIOD_NOT_ENDED");

    const outOfOrder = await admin().put(`/cash-closing/close/${P2}`, {});
    expect(outOfOrder.status).toBe(409);
    expect(outOfOrder.body.code).toBe("CASH_PERIOD_PREVIOUS_OPEN");

    const badPeriod = await admin().put("/cash-closing/close/2026-13", {});
    expect(badPeriod.status).toBe(400);
  });

  it("cierra el mes de inicio: foto = Caja (I1) y saldo inicial = declarado (I2)", async () => {
    const closed = await admin().put(`/cash-closing/close/${P1}`, { notes: "Cierre de prueba" });
    expect(closed.status).toBe(200);
    const detail = closed.body.data as PeriodDetail;
    expect(detail).toMatchObject({ status: "closed", is_preview: false, close_count: 1 });
    expect(detail.balances.find((row) => row.account_key === 0)).toMatchObject({ opening: 500, closing: 450 });
    expect(detail.balances.find((row) => row.account_key === ctx.bankAccountId)).toMatchObject({ opening: 1000, closing: 1100 });
    // La cuenta sin movimientos pero con saldo inicial queda con su fila en cero.
    expect(detail.balances.find((row) => row.account_key === unusedAccountId)).toMatchObject({ opening: 0, closing: 0 });
    expectEquation(detail);
    await expectI1(P1);

    const again = await admin().put(`/cash-closing/close/${P1}`, {});
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("CASH_PERIOD_ALREADY_CLOSED");

    // El saldo inicial ya forma parte del cierre.
    const locked = await admin().put("/cash-closing/opening", {
      start_period: P1,
      openings: [{ payment_account_id: null, amount: 600 }],
    });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe("CASH_OPENING_LOCKED");

    // Crear con fecha del mes cerrado: 409 (guarda del WP0).
    const blocked = await createPayment({ paid_at: day(P1, 25) });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("CASH_PERIOD_CLOSED");

    await expectI4();
  });

  it("un Administrador CON tienda asignada ve el cierre de TODA su empresa (es por rol, no por tienda)", async () => {
    const storeAdmin = authedRequest(ctx.storeAdmin.token);

    // El menú y los botones le llegan igual que a un admin sin tienda.
    const access = await storeAdmin.get("/access/me");
    expect(access.status).toBe(200);
    expect(access.body.data.modules).toContain("cash_closing");
    expect(access.body.data.buttons).toEqual(expect.arrayContaining(["cash_closing.balances.button", "cash_closing.close.button"]));

    // Mismo detalle y mismos saldos que el admin de empresa: la empresa entera,
    // no solo su tienda. Lo que mande en ?companyId se ignora (su empresa).
    const own = (await admin().get(`/cash-closing/find/${P1}`)).body.data as PeriodDetail;
    const fromStoreAdmin = await storeAdmin.get(`/cash-closing/find/${P1}?companyId=1`);
    expect(fromStoreAdmin.status).toBe(200);
    expect((fromStoreAdmin.body.data as PeriodDetail).totals).toEqual(own.totals);
    expect((await storeAdmin.get("/cash-closing/balances")).status).toBe(200);
    expect((await storeAdmin.get("/cash-closing/list")).status).toBe(200);
  });

  it("una cuenta usada en el saldo inicial o en un cierre no se elimina (409, no 500)", async () => {
    const removed = await admin().delete(`/variable_general/delete/${unusedAccountId}`);
    expect(removed.status).toBe(409);
    expect(removed.body.code).toBe("PAYMENT_ACCOUNT_IN_USE");
  });

  it("concurrencia: cerrar P2 mientras entran 5 pagos con fecha de P2 → cada pago entra al cierre o recibe 409", async () => {
    const { quotationId: concurrentQuotation } = await createQuotationFixture(ctx.admin.token, ctx.companyId);
    const payments = Array.from({ length: 5 }, () =>
      admin().post(`/quotation/${concurrentQuotation}/payments`, { amount: 1, method: "cash", paid_at: day(P2, 20) })
    );
    const [close, ...created] = await Promise.all([admin().put(`/cash-closing/close/${P2}`, {}), ...payments]);
    expect(close.status).toBe(200);
    for (const res of created) {
      expect([201, 409]).toContain(res.status);
      if (res.status === 409) expect(res.body.code).toBe("CASH_PERIOD_CLOSED");
    }
    const accepted = created.filter((res) => res.status === 201).length;
    const rows = await getData<{ meta: { total: number } }>(
      `/cash-movement/list?limit=1&quotationId=${concurrentQuotation}&dateFrom=${startOf(P2)}&dateTo=${lastDayOf(P2)}`
    );
    expect(rows.meta.total).toBe(accepted);

    await expectI1(P2);
    const p1 = await detailOf(P1);
    const p2 = await detailOf(P2);
    expectEquation(p2);
    expectChained(p1, p2);
    p2DetailBeforeReopen = p2;

    // Saldos: ancla = P2 (cadena cerrada desde el inicio).
    expect((await createPayment({ amount: 10, paid_at: TODAY })).status).toBe(201);
    const balances = await expectI4();
    expect(balances.base_period).toBe(P2);
    expect(balances.base_label).toMatch(/^Cierre de /);
    expect(balances.provisional_note).toBeNull();
  });

  it("corregir un pago de un mes cerrado: el cierre no cambia (I1) y la diferencia aparece como ajuste hoy", async () => {
    const corrected = await admin().put(`/payment/update/${p1PaymentId}`, {
      amount: 80,
      method: "transfer",
      operation_number: "OP-CIERRE",
      paid_at: day(P1, 10),
      payment_account_id: ctx.bankAccountId,
      notes: null,
      reason: "El cliente pagó 80, no 100",
    });
    expect(corrected.status).toBe(200);

    await expectI1(P1);
    const p1 = await detailOf(P1);
    expect(p1.counts.adjustments_affecting).toBe(1);
    expect((await detailOf(CUR)).counts.adjustments_posted).toBe(1);

    const affecting = await getData<{ data: Record<string, unknown>[]; meta: { total: number } }>(
      `/cash-closing/${P1}/adjustments?type=affecting`
    );
    expect(affecting.meta.total).toBe(1);
    expect(affecting.data[0]).toMatchObject({ leg: "hold", amount: 20, source_type: "quotation_payment", posted_date: TODAY });

    const posted = await getData<{ data: Record<string, unknown>[] }>(`/cash-closing/${CUR}/adjustments?type=posted`);
    expect(posted.data[0]).toMatchObject({
      leg: "posting",
      amount: -20,
      net_effect: -20,
      affected_period: P1,
      entry_date: TODAY,
      action: "correction",
    });

    // Historial del pago: resumen del ajuste.
    const history = await getData<{ data: { kind: string; adjustment: Record<string, unknown> | null }[] }>(
      `/payment/${p1PaymentId}/corrections`
    );
    expect(history.data[0]?.kind).toBe("adjustment");
    expect(history.data[0]?.adjustment).toMatchObject({ affected_period: P1, posted_date: TODAY, net_effect: -20 });

    await expectI4();
  });

  it("reabrir: exige motivo, solo un administrador, y los meses posteriores quedan provisionales", async () => {
    expect((await gestor().put(`/cash-closing/reopen/${P1}`, { reason: "Falta un depósito" })).status).toBe(403);

    const noReason = await admin().put(`/cash-closing/reopen/${P1}`, {});
    expect(noReason.status).toBe(400);
    expect(noReason.body.code).toBe("INVALID_REASON");
    const short = await admin().put(`/cash-closing/reopen/${P1}`, { reason: "abc" });
    expect(short.status).toBe(400);
    expect(short.body.code).toBe("INVALID_REASON");

    const reopened = await admin().put(`/cash-closing/reopen/${P1}`, { reason: "Falta el depósito del último día" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data).toMatchObject({ status: "reopened", is_preview: true });

    const twice = await admin().put(`/cash-closing/reopen/${P1}`, { reason: "Otra vez por error" });
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe("CASH_PERIOD_NOT_CLOSED");

    const list = await getData<{ data: { period: string; status: string; is_provisional: boolean }[] }>("/cash-closing/list");
    expect(list.data.find((row) => row.period === P1)?.status).toBe("reopened");
    expect(list.data.find((row) => row.period === P2)).toMatchObject({ status: "closed", is_provisional: true });

    // Con el inicio reabierto el ancla vuelve al saldo inicial.
    const balances = await expectI4();
    expect(balances.base_period).toBeNull();
    expect(balances.provisional_note).not.toBeNull();

    // P2 sigue cerrado: su fila no se mueve, y no se puede re-cerrar.
    const p2Again = await admin().put(`/cash-closing/close/${P2}`, {});
    expect(p2Again.status).toBe(409);
    expect(p2Again.body.code).toBe("CASH_PERIOD_ALREADY_CLOSED");

    // Saldo inicial editable de nuevo; el mes de inicio, no (ya hay cierres).
    const edited = await admin().put("/cash-closing/opening", {
      start_period: P1,
      openings: [{ payment_account_id: null, amount: 600 }],
    });
    expect(edited.status).toBe(200);
    const moved = await admin().put("/cash-closing/opening", {
      start_period: P2,
      openings: [{ payment_account_id: null, amount: 600 }],
    });
    expect(moved.status).toBe(409);
    expect(moved.body.code).toBe("CASH_START_PERIOD_LOCKED");

    // Reabierto = abierto: se puede registrar con fecha del mes.
    await createMovement({ amount: 200, occurred_at: lastDayOf(P1), payment_account_id: ctx.bankAccountId });
  });

  it("re-cerrar recalcula los meses cerrados posteriores sin cambiar sus movimientos (I5) y deja rastro", async () => {
    const reclosed = await admin().put(`/cash-closing/close/${P1}`, {});
    expect(reclosed.status).toBe(200);
    const p1 = reclosed.body.data as PeriodDetail;
    expect(p1).toMatchObject({ status: "closed", close_count: 2 });
    // Banco: 1000 + 80 (pago corregido) + 20 (valor al cierre) + 200 (nuevo) = 1300.
    expect(p1.balances.find((row) => row.account_key === ctx.bankAccountId)).toMatchObject({
      opening: 1000,
      income: 300,
      closing: 1300,
    });
    expect(p1.balances.find((row) => row.account_key === 0)).toMatchObject({ opening: 600, closing: 550 });
    expectEquation(p1);

    const p2 = await detailOf(P2);
    expect(p2.is_provisional).toBe(false);
    expectChained(p1, p2);
    expectEquation(p2);
    const before = new Map(p2DetailBeforeReopen.balances.map((row) => [row.account_key, row]));
    for (const row of p2.balances) {
      const previous = before.get(row.account_key);
      expect([row.income, row.expense, row.adjustments]).toEqual([
        previous?.income ?? 0,
        previous?.expense ?? 0,
        previous?.adjustments ?? 0,
      ]);
    }
    await expectI1(P1);
    await expectI1(P2);

    const balances = await expectI4();
    expect(balances.base_period).toBe(P2);

    const p2Events = await getData<{ data: { action: string }[] }>(`/cash-closing/${P2}/events`);
    expect(p2Events.data.map((row) => row.action)).toEqual(expect.arrayContaining(["close", "recalculate"]));
    const p1Events = await getData<{ data: { action: string; snapshot: unknown }[] }>(`/cash-closing/${P1}/events?limit=50`);
    expect(p1Events.data.map((row) => row.action)).toEqual(
      expect.arrayContaining(["opening_set", "close", "reopen", "reclose"])
    );
    expect(p1Events.data.every((row) => row.snapshot !== null)).toBe(true);
  });
});
