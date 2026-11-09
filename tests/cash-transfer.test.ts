import { authedRequest, login } from "./helpers/apiClient";
import { queryRows } from "./helpers/db";
import { CashClosingTestCompany, createCashClosingTestCompany } from "./helpers/fixtures";

const QA_SUPERADMIN = { email: "qa.superadmin@grulla.test", password: "Test1234" };
const SETUP_TIMEOUT = 300_000;

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

// P = mes anterior (se cierra); CUR = mes actual (abierto).
const TODAY = limaToday();
const CUR = TODAY.slice(0, 7);
const P = shiftPeriod(CUR, -1);
const P_START = `${P}-01`;
const P_END = lastDayOf(P);
const CUR_START = `${CUR}-01`;
const pDay = (value: number): string => `${P}-${String(value).padStart(2, "0")}`;

interface AccountSummary {
  payment_account_id: number | null;
  income: number;
  expense: number;
  transfers: number;
  adjustments: number;
  net: number;
}

interface CashSummary {
  income: number;
  expense: number;
  transfers: number;
  adjustments: number;
  net: number;
  by_account: AccountSummary[];
}

interface CashItem {
  id: string;
  source: string;
  source_id: number;
  direction: "income" | "expense";
  amount: number;
  payment_account_id: number | null;
  transfer: { transfer_id: number; from_payment_account_id: number | null; to_payment_account_id: number | null } | null;
}

interface CashList {
  data: CashItem[];
  summary: CashSummary;
}

interface Balance {
  payment_account_id: number | null;
  opening: number;
  income: number;
  expense: number;
  transfers: number;
  adjustments: number;
  closing: number;
}

/**
 * Transferencias entre cuentas (módulo cash_transfer): mueven el saldo de
 * cada cuenta pero NO son ingreso ni egreso de la empresa — ni en Caja, ni en
 * Estadísticas, ni en el cierre. Empresa DESECHABLE (helper de cierres): banco
 * y Yape propios.
 *
 * Mes actual: ingreso manual de S/ 1000 al banco y transferencia de S/ 300 del
 * banco a Yape. Mes anterior (P, se cierra): ingreso de S/ 500 al banco y
 * transferencia de S/ 200 del banco a Yape.
 */
describe("Transferencias entre cuentas", () => {
  let ctx: CashClosingTestCompany;
  let transferId: number;

  const admin = () => authedRequest(ctx.admin.token);
  const CUR_RANGE = `&dateFrom=${CUR_START}&dateTo=${TODAY}`;

  const cashList = async (query: string): Promise<CashList> => {
    const res = await admin().get(`/cash-movement/list?limit=100${query}`);
    expect(res.status).toBe(200);
    return res.body.data as CashList;
  };
  const accountOf = (summary: CashSummary, accountId: number | null) =>
    summary.by_account.find((row) => row.payment_account_id === accountId);

  const createTransfer = (body: Record<string, unknown>) => admin().post("/cash-movement/transfer/create", body);

  beforeAll(async () => {
    const superToken = (await login(QA_SUPERADMIN.email, QA_SUPERADMIN.password)).token;
    ctx = await createCashClosingTestCompany(superToken);

    const income = await admin().post("/cash-movement/create", {
      direction: "income",
      category: "otro_ingreso",
      amount: 1000,
      occurred_at: TODAY,
      payment_account_id: ctx.bankAccountId,
    });
    expect(income.status).toBe(201);

    const transfer = await createTransfer({
      from_payment_account_id: ctx.bankAccountId,
      to_payment_account_id: ctx.yapeAccountId,
      amount: 300,
      occurred_at: TODAY,
      description: "Pase a Yape",
      operation_number: "OP-TRF-1",
    });
    expect(transfer.status).toBe(201);
    transferId = transfer.body.data.id;
  }, SETUP_TIMEOUT);

  it("responde la transferencia con sus cuentas y la fecha de auditoría separada", async () => {
    const res = await admin().get(`/cash-movement/transfer/list?dateFrom=${CUR_START}&dateTo=${TODAY}`);
    expect(res.status).toBe(200);
    const item = res.body.data.data.find((row: { id: number }) => row.id === transferId);
    expect(item).toMatchObject({
      amount: 300,
      occurred_at: TODAY,
      from_payment_account_id: ctx.bankAccountId,
      to_payment_account_id: ctx.yapeAccountId,
      is_deleted: false,
      description: "Pase a Yape",
    });
    expect(item.created_at).toEqual({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), time: expect.stringMatching(/^\d{2}:\d{2}/) });
    expect(res.body.data.meta).toMatchObject({ page: 1, total: 1 });
  });

  it("Caja: dos filas, el saldo de cada cuenta cambia pero ingresos/egresos no se inflan", async () => {
    const list = await cashList(CUR_RANGE);
    const legs = list.data.filter((row) => row.source === "transfer");
    expect(legs).toHaveLength(2);
    expect(legs.find((row) => row.direction === "expense")).toMatchObject({
      id: `trf-${transferId}-out`,
      source_id: transferId,
      amount: 300,
      payment_account_id: ctx.bankAccountId,
    });
    expect(legs.find((row) => row.direction === "income")).toMatchObject({
      id: `trf-${transferId}-in`,
      payment_account_id: ctx.yapeAccountId,
    });

    expect(list.summary).toMatchObject({ income: 1000, expense: 0, transfers: 0, adjustments: 0, net: 1000 });
    expect(accountOf(list.summary, ctx.bankAccountId)).toMatchObject({ income: 1000, expense: 0, transfers: -300, net: 700 });
    expect(accountOf(list.summary, ctx.yapeAccountId)).toMatchObject({ income: 0, expense: 0, transfers: 300, net: 300 });
  });

  it("Caja con filtros: por cuenta solo su punta; por sentido; por fuente; por categoría ninguna", async () => {
    const yape = await cashList(`${CUR_RANGE}&paymentAccountId=${ctx.yapeAccountId}`);
    expect(yape.data.map((row) => row.id)).toEqual([`trf-${transferId}-in`]);
    expect(yape.summary).toMatchObject({ income: 0, expense: 0, transfers: 300, net: 300 });

    const outOnly = await cashList(`${CUR_RANGE}&direction=expense`);
    expect(outOnly.data.filter((row) => row.source === "transfer").map((row) => row.id)).toEqual([`trf-${transferId}-out`]);

    const onlyTransfers = await cashList(`${CUR_RANGE}&source=transfer`);
    expect(onlyTransfers.data).toHaveLength(2);
    expect(onlyTransfers.summary).toMatchObject({ income: 0, expense: 0, transfers: 0, net: 0 });

    const byCategory = await cashList(`${CUR_RANGE}&category=otro_ingreso`);
    expect(byCategory.data.some((row) => row.source === "transfer")).toBe(false);
  });

  it("Estadísticas no cuentan la transferencia como ingreso ni egreso", async () => {
    const res = await admin().get(`/statistics/overview?dateFrom=${CUR_START}&dateTo=${TODAY}`);
    expect(res.status).toBe(200);
    expect(res.body.data.kpis.current).toMatchObject({ other_income: 1000, expenses: 0, net_cash: 1000 });
  });

  it("rechaza la misma cuenta en las dos puntas (también Efectivo → Efectivo)", async () => {
    const same = await createTransfer({
      from_payment_account_id: ctx.bankAccountId,
      to_payment_account_id: ctx.bankAccountId,
      amount: 10,
      occurred_at: TODAY,
    });
    expect(same.status).toBe(400);
    expect(same.body.code).toBe("CASH_TRANSFER_SAME_ACCOUNT");

    const cashToCash = await createTransfer({ from_payment_account_id: null, to_payment_account_id: null, amount: 10, occurred_at: TODAY });
    expect(cashToCash.status).toBe(400);
    expect(cashToCash.body.code).toBe("CASH_TRANSFER_SAME_ACCOUNT");
  });

  it("valida monto, fecha futura y cuentas de otra empresa", async () => {
    const zero = await createTransfer({ from_payment_account_id: ctx.bankAccountId, amount: 0, occurred_at: TODAY });
    expect(zero.status).toBe(400);

    const future = await createTransfer({ from_payment_account_id: ctx.bankAccountId, amount: 10, occurred_at: "2999-01-01" });
    expect(future.status).toBe(400);

    // Una cuenta que no es de la empresa (id inexistente para esta empresa).
    const foreign = await createTransfer({ from_payment_account_id: 999_999_999, amount: 10, occurred_at: TODAY });
    expect([403, 404]).toContain(foreign.status);
  });

  it("corregir: exige motivo, rechaza 'sin cambios' y recalcula Caja", async () => {
    const noReason = await admin().put(`/cash-movement/transfer/update/${transferId}`, { amount: 250 });
    expect(noReason.status).toBe(400);

    const noChanges = await admin().put(`/cash-movement/transfer/update/${transferId}`, { amount: 300, reason: "Sin cambios reales" });
    expect(noChanges.status).toBe(400);
    expect(noChanges.body.code).toBe("NO_CHANGES");

    const fixed = await admin().put(`/cash-movement/transfer/update/${transferId}`, {
      amount: 250,
      to_payment_account_id: null,
      reason: "El pase fue de 250 y en efectivo",
    });
    expect(fixed.status).toBe(200);
    expect(fixed.body.data).toMatchObject({ amount: 250, to_payment_account_id: null, to_account_name: "Efectivo" });

    const list = await cashList(CUR_RANGE);
    expect(list.summary).toMatchObject({ income: 1000, expense: 0, transfers: 0, net: 1000 });
    expect(accountOf(list.summary, ctx.bankAccountId)).toMatchObject({ transfers: -250, net: 750 });
    expect(accountOf(list.summary, null)).toMatchObject({ transfers: 250, net: 250 });
    expect(accountOf(list.summary, ctx.yapeAccountId)).toBeUndefined();

    const logs = await queryRows<{ description: string }>(
      "SELECT description FROM log WHERE module = 'cash_transfer' AND action = 'UPDATE' AND description LIKE ?",
      [`%transferencia #${transferId} %`]
    );
    expect(logs.some((row) => row.description.includes("El pase fue de 250 y en efectivo"))).toBe(true);
  });

  it("anular quita las dos filas; reactivar las devuelve (con log de cada cambio)", async () => {
    const annul = await admin().put(`/cash-movement/transfer/disable/${transferId}`);
    expect(annul.status).toBe(200);
    expect(annul.body.data.is_deleted).toBe(true);
    const afterAnnul = await cashList(CUR_RANGE);
    expect(afterAnnul.data.some((row) => row.source === "transfer")).toBe(false);
    expect(accountOf(afterAnnul.summary, ctx.bankAccountId)).toMatchObject({ transfers: 0, net: 1000 });

    const corrected = await admin().put(`/cash-movement/transfer/update/${transferId}`, { amount: 100, reason: "Anulada no se corrige" });
    expect(corrected.status).toBe(409);
    expect(corrected.body.code).toBe("CASH_TRANSFER_ANNULLED");

    const restore = await admin().put(`/cash-movement/transfer/disable/${transferId}`);
    expect(restore.status).toBe(200);
    expect(restore.body.data.is_deleted).toBe(false);
    expect((await cashList(CUR_RANGE)).data.filter((row) => row.source === "transfer")).toHaveLength(2);

    const logs = await queryRows<{ action: string }>(
      "SELECT action FROM log WHERE module = 'cash_transfer' AND company_id = ? AND action IN ('DISABLE', 'ACTIVE') AND description LIKE ?",
      [ctx.companyId, `%transferencia #${transferId}:%`]
    );
    expect(logs.map((row) => row.action).sort()).toEqual(["ACTIVE", "DISABLE"]);
  });

  it("una cuenta usada SOLO en una transferencia (aunque esté anulada) no se puede eliminar", async () => {
    // Cuenta propia de este test: así lo único que la usa es la transferencia.
    const account = await admin().post("/variable_general/create", {
      category: "payment_account",
      title: "Cuenta",
      prefix_id: "bank",
      name: `Interbank Transfer ${Date.now()}`,
      ref1: "123456789",
      company_id: ctx.companyId,
    });
    expect(account.status).toBe(200);
    const accountId = account.body.data.id as number;

    const transfer = await createTransfer({ from_payment_account_id: null, to_payment_account_id: accountId, amount: 5, occurred_at: TODAY });
    expect(transfer.status).toBe(201);
    // Se anula enseguida para no tocar los saldos que revisan los demás tests.
    expect((await admin().put(`/cash-movement/transfer/disable/${transfer.body.data.id}`)).status).toBe(200);

    const removed = await admin().delete(`/variable_general/delete/${accountId}`);
    expect(removed.status).toBe(409);
    expect(removed.body.code).toBe("PAYMENT_ACCOUNT_IN_USE");
  });

  describe("cierre de caja", () => {
    let closedTransferId: number;

    beforeAll(async () => {
      const income = await admin().post("/cash-movement/create", {
        direction: "income",
        category: "otro_ingreso",
        amount: 500,
        occurred_at: pDay(5),
        payment_account_id: ctx.bankAccountId,
      });
      expect(income.status).toBe(201);

      const transfer = await createTransfer({
        from_payment_account_id: ctx.bankAccountId,
        to_payment_account_id: ctx.yapeAccountId,
        amount: 200,
        occurred_at: pDay(6),
      });
      expect(transfer.status).toBe(201);
      closedTransferId = transfer.body.data.id;

      const opening = await admin().put("/cash-closing/opening", { start_period: P, openings: [{ payment_account_id: null, amount: 0 }] });
      expect(opening.status).toBe(200);
      const close = await admin().put(`/cash-closing/close/${P}`, {});
      expect(close.status).toBe(200);
    }, SETUP_TIMEOUT);

    it("el mes cerrado guarda las transferencias por cuenta y el total de la empresa no cambia", async () => {
      const res = await admin().get(`/cash-closing/find/${P}`);
      expect(res.status).toBe(200);
      const balances = res.body.data.balances as Balance[];
      const bank = balances.find((row) => row.payment_account_id === ctx.bankAccountId);
      const yape = balances.find((row) => row.payment_account_id === ctx.yapeAccountId);
      expect(bank).toMatchObject({ opening: 0, income: 500, expense: 0, transfers: -200, closing: 300 });
      expect(yape).toMatchObject({ opening: 0, income: 0, expense: 0, transfers: 200, closing: 200 });
      expect(res.body.data.totals).toMatchObject({ income: 500, expense: 0, transfers: 0, closing: 500 });

      const stored = await queryRows<{ transfers: string; closing: string }>(
        "SELECT b.transfers, b.closing FROM cash_period_balance b INNER JOIN cash_period p ON p.id = b.cash_period_id WHERE p.company_id = ? AND p.period = ? AND b.payment_account_id = ?",
        [ctx.companyId, P, ctx.bankAccountId]
      );
      expect(stored.map((row) => [Number(row.transfers), Number(row.closing)])).toEqual([[-200, 300]]);
    });

    it("no deja registrar, corregir ni anular una transferencia de un mes cerrado", async () => {
      const create = await createTransfer({
        from_payment_account_id: ctx.bankAccountId,
        to_payment_account_id: ctx.yapeAccountId,
        amount: 10,
        occurred_at: pDay(20),
      });
      expect(create.status).toBe(409);
      expect(create.body.code).toBe("CASH_PERIOD_CLOSED");

      const update = await admin().put(`/cash-movement/transfer/update/${closedTransferId}`, { amount: 150, reason: "Corregir en mes cerrado" });
      expect(update.status).toBe(409);
      expect(update.body.code).toBe("CASH_PERIOD_CLOSED");

      const annul = await admin().put(`/cash-movement/transfer/disable/${closedTransferId}`);
      expect(annul.status).toBe(409);

      // Mover una transferencia del mes abierto HACIA el mes cerrado tampoco.
      const moveIn = await admin().put(`/cash-movement/transfer/update/${transferId}`, { occurred_at: pDay(15), reason: "Mover al mes cerrado" });
      expect(moveIn.status).toBe(409);

      // Lo que no mueve saldos sí se puede corregir.
      const note = await admin().put(`/cash-movement/transfer/update/${closedTransferId}`, { description: "Nota", reason: "Solo la descripción" });
      expect(note.status).toBe(200);
    });

    it("saldos actuales = cierre + lo posterior, con las transferencias de cada cuenta", async () => {
      const res = await admin().get("/cash-closing/balances");
      expect(res.status).toBe(200);
      const accounts = res.body.data.accounts as { payment_account_id: number | null; transfers: number; current_balance: number }[];
      const find = (id: number | null) => accounts.find((row) => row.payment_account_id === id);
      // Banco: 300 al cierre + 1000 − 250. Yape: 200 al cierre. Efectivo: +250.
      expect(find(ctx.bankAccountId)).toMatchObject({ transfers: -250, current_balance: 1050 });
      expect(find(ctx.yapeAccountId)).toMatchObject({ transfers: 0, current_balance: 200 });
      expect(find(null)).toMatchObject({ transfers: 250, current_balance: 250 });
      expect(res.body.data.totals).toMatchObject({ transfers: 0, current_balance: 1500 });
    });

    it("las Estadísticas del mes cerrado tampoco ven la transferencia", async () => {
      const res = await admin().get(`/statistics/overview?dateFrom=${P_START}&dateTo=${P_END}`);
      expect(res.status).toBe(200);
      expect(res.body.data.kpis.current).toMatchObject({ other_income: 500, expenses: 0, net_cash: 500 });
    });
  });
});
