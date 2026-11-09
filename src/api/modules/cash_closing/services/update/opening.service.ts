import { Transaction, UniqueConstraintError } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { fromCents, toCents } from "../../../../../core/utils/money";
import {
  addDaysToDateOnly,
  formatPeriodEs,
  isValidPeriod,
  nowUtc,
  periodBounds,
  periodOf,
  todayInBusinessTz,
} from "../../../../../utils/dateUtils";
import {
  CASH_ACCOUNT_KEY,
  CASH_ACCOUNT_NAME,
  CashOpeningResponse,
  CashOpeningSnapshot,
  SetCashOpeningInput,
} from "../../types/cash_closing.types";
import { CashLedgerState, loadPeriodMap } from "../shared/period_state.service";
import { accountKeyOf, DeclaredOpening, flowNetCents, loadDeclaredOpenings, loadFlowsByAccount } from "../shared/balances.service";
import {
  getCashOpening,
  isOpeningEditable,
  isStartPeriodEditable,
  loadCompanyPaymentAccounts,
} from "../find/opening.service";
import { CASH_CLOSING_CODES } from "../find/period_rules.service";
import { insertPeriodEvent, logCashClosing } from "./period_writes";

// Antes de esto, un mes de inicio es casi seguro un error de tipeo.
const MIN_START_PERIOD = "2000-01";

const openingSnapshotOf = (
  startPeriod: string,
  notes: string | null,
  openings: Map<number, DeclaredOpening>
): CashOpeningSnapshot => ({
  start_period: startPeriod,
  start_date: periodBounds(startPeriod).start,
  notes,
  openings: [...openings.values()]
    .sort((a, b) => a.accountKey - b.accountKey)
    .map((row) => ({
      account_key: row.accountKey,
      payment_account_id: row.paymentAccountId,
      account_name: row.name,
      amount: fromCents(row.cents),
      history_amount: row.historyCents === null ? null : fromCents(row.historyCents),
    })),
});

const assertValidStartPeriod = (startPeriod: string, today: string): void => {
  if (isValidPeriod(startPeriod) && startPeriod >= MIN_START_PERIOD && startPeriod <= periodOf(today)) return;
  throw new AppError(
    400,
    "El mes de inicio no es válido: debe ser el mes actual o uno anterior.",
    undefined,
    CASH_CLOSING_CODES.startPeriodInvalid
  );
};

// Crea el libro de la empresa. UNIQUE(company_id): un "configurar caja"
// concurrente falla acá → 409 (el usuario reintenta y ve lo guardado).
async function createLedger(
  companyId: number,
  startPeriod: string,
  notes: string | null,
  actorId: number,
  now: Date,
  transaction: Transaction
): Promise<number> {
  try {
    const created = await DataBase.instance.cash_ledger.create(
      {
        company_id: companyId,
        start_period: startPeriod,
        start_date: periodBounds(startPeriod).start,
        notes,
        created_by: actorId,
        created_at: now,
        updated_by: actorId,
        updated_at: now,
      },
      { transaction }
    );
    return Number(created.id);
  } catch (error) {
    if (!(error instanceof UniqueConstraintError)) throw error;
    throw new AppError(
      409,
      "Otra persona acaba de configurar la caja de esta empresa. Vuelve a abrir el saldo inicial.",
      undefined,
      CASH_CLOSING_CODES.ledgerConflict
    );
  }
}

const assertLedgerEditable = (
  ledger: CashLedgerState,
  startPeriod: string,
  openingEditable: boolean,
  startEditable: boolean
): void => {
  if (!openingEditable) {
    throw new AppError(
      409,
      `El saldo inicial ya forma parte del cierre de ${formatPeriodEs(ledger.startPeriod)}: reábrelo para cambiarlo.`,
      undefined,
      CASH_CLOSING_CODES.openingLocked
    );
  }
  if (startPeriod !== ledger.startPeriod && !startEditable) {
    throw new AppError(
      409,
      `El mes de inicio ya no se puede cambiar: ${formatPeriodEs(ledger.startPeriod)} ya se cerró al menos una vez.`,
      undefined,
      CASH_CLOSING_CODES.startPeriodLocked
    );
  }
};

/**
 * Configura o edita el saldo inicial (PUT /cash-closing/opening). Los montos
 * enviados se insertan o actualizan por cuenta; las cuentas no enviadas
 * conservan lo que tenían (una cuenta sin fila cuenta como 0). La pista
 * history_amount se guarda con el neto de Caja antes del inicio. Mismo
 * patrón de lock que el cierre (libro FOR UPDATE primero, READ COMMITTED).
 */
export async function setCashOpening({
  companyId,
  startPeriod,
  openings,
  notes,
  actorId,
}: SetCashOpeningInput): Promise<CashOpeningResponse> {
  const today = todayInBusinessTz();
  assertValidStartPeriod(startPeriod, today);
  const ledgerNotes = notes?.trim() ? notes.trim().slice(0, 500) : null;

  await DataBase.instance.sequelize.transaction(
    { isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
    async (transaction) => {
      const map = await loadPeriodMap(companyId, transaction, "update");
      if (map.ledger) {
        assertLedgerEditable(map.ledger, startPeriod, isOpeningEditable(map), isStartPeriodEditable(map));
      }

      // Cada cuenta tiene que ser de ESTA empresa (también se aceptan las
      // deshabilitadas: pueden tener saldo). Una consulta para todas.
      const companyAccounts = await loadCompanyPaymentAccounts(companyId, transaction);
      const foreign = openings.find(
        (row) => row.payment_account_id !== null && !companyAccounts.has(Number(row.payment_account_id))
      );
      if (foreign) throw new AppError(403, "La cuenta seleccionada no pertenece a esta empresa");

      const now = nowUtc();
      const previous = map.ledger ? await loadDeclaredOpenings(map.ledger.id, transaction) : null;
      const previousSnapshot =
        map.ledger && previous ? openingSnapshotOf(map.ledger.startPeriod, map.ledger.notes, previous) : null;

      const startDate = periodBounds(startPeriod).start;
      const ledgerId = map.ledger
        ? Number(map.ledger.id)
        : await createLedger(companyId, startPeriod, ledgerNotes, actorId, now, transaction);
      if (map.ledger) {
        await DataBase.instance.cash_ledger.update(
          { start_period: startPeriod, start_date: startDate, notes: ledgerNotes, updated_by: actorId, updated_at: now },
          { where: { id: ledgerId }, transaction }
        );
      }

      // Pista: neto de Caja de cada cuenta ANTES del inicio (al guardar).
      const history = await loadFlowsByAccount(companyId, { dateTo: addDaysToDateOnly(startDate, -1) }, transaction);
      // Incluye las transferencias entre cuentas (mismo cálculo que los saldos).
      const historyCentsOf = (key: number): number => flowNetCents(history.get(key));

      // Lo enviado + lo que ya estaba (para refrescar su pista si cambió el
      // mes de inicio). Una sentencia: INSERT … ON DUPLICATE KEY UPDATE sobre
      // UNIQUE(cash_ledger_id, account_key).
      const requested = new Map(
        openings.map((row) => {
          const paymentAccountId = row.payment_account_id === null ? null : Number(row.payment_account_id);
          return [accountKeyOf(paymentAccountId), { paymentAccountId, amountCents: toCents(row.amount) }];
        })
      );
      const keys = new Set([...requested.keys(), ...(previous ? previous.keys() : [])]);
      const rows = [...keys].map((key) => {
        const paymentAccountId = key === CASH_ACCOUNT_KEY ? null : key;
        const name =
          key === CASH_ACCOUNT_KEY ? CASH_ACCOUNT_NAME : (companyAccounts.get(key)?.name ?? previous?.get(key)?.name ?? "Cuenta");
        const amountCents = requested.get(key)?.amountCents ?? previous?.get(key)?.cents ?? 0;
        return {
          company_id: companyId,
          cash_ledger_id: ledgerId,
          account_key: key,
          payment_account_id: paymentAccountId,
          account_name: name.slice(0, 150),
          amount: fromCents(amountCents),
          history_amount: fromCents(historyCentsOf(key)),
          created_by: actorId,
          created_at: now,
          updated_by: actorId,
          updated_at: now,
        };
      });
      if (rows.length > 0) {
        await DataBase.instance.cash_ledger_opening.bulkCreate(rows, {
          transaction,
          updateOnDuplicate: ["account_name", "amount", "history_amount", "updated_by", "updated_at"],
        });
      }

      const current = await loadDeclaredOpenings(ledgerId, transaction);
      await insertPeriodEvent({
        companyId,
        period: null,
        action: "opening_set",
        reason: ledgerNotes,
        previousSnapshot,
        snapshot: openingSnapshotOf(startPeriod, ledgerNotes, current),
        actorId,
        now,
        transaction,
      });
      await logCashClosing({
        actorId,
        companyId,
        description: `${map.ledger ? "Editó" : "Configuró"} el saldo inicial de la caja (inicio ${formatPeriodEs(startPeriod)}; ${current.size} cuenta(s)).`,
        transaction,
      });
    }
  );

  return getCashOpening(companyId);
}
