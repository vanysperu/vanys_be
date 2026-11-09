import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { fromCents, toCents } from "../../../../../core/utils/money";
import {
  addDaysToDateOnly,
  capitalizeEs,
  formatDateOnlyEsPe,
  formatPeriodEs,
  periodBounds,
  shiftPeriod,
} from "../../../../../utils/dateUtils";
import { getCashFlowSummary } from "../../../cash_movement/services/find/cash_movement.service";
import {
  CASH_ACCOUNT_KEY,
  CASH_ACCOUNT_NAME,
  CashBalanceAccount,
  CashBalancesResponse,
  CashPeriodAccountBalance,
  CashPeriodSnapshot,
  CashPeriodTotals,
} from "../../types/cash_closing.types";
import { CashPeriodMap, isClosedPeriod } from "./period_state.service";

// Saldos del cierre de caja. Todo sale de getCashFlowSummary (el mismo cálculo
// que el resumen de Caja), nunca de SQL propio: así un mes cerrado coincide
// siempre con lo que muestra Caja para ese rango (invariante I1).
//
//   cierre(P, cuenta) = inicial(P) + ingresos(P) − egresos(P)
//                       + transferencias(P) + ajustes(P)
//   inicial(P)        = cierre(P−1) guardado, o el saldo inicial declarado si
//                       P es el mes de inicio (I2).
//
// Transferencias entre cuentas: mueven el saldo de cada cuenta pero no son
// ingreso ni egreso; sumadas en toda la empresa dan 0.
//
// Cálculo interno en céntimos enteros (core/utils/money.ts).

// Cuenta: 0 = Efectivo, si no el id de la cuenta.
export const accountKeyOf = (paymentAccountId: number | null): number => paymentAccountId ?? CASH_ACCOUNT_KEY;

export interface AccountRef {
  accountKey: number;
  paymentAccountId: number | null;
  name: string;
}

export interface AccountFlowCents extends AccountRef {
  incomeCents: number;
  expenseCents: number;
  transfersCents: number;
  adjustmentsCents: number;
}

interface AccountAmountCents extends AccountRef {
  cents: number;
}

export interface DeclaredOpening extends AccountAmountCents {
  historyCents: number | null;
}

const ZERO_TOTALS: CashPeriodTotals = { opening: 0, income: 0, expense: 0, transfers: 0, adjustments: 0, closing: 0 };

// Efectivo primero; después las cuentas por nombre.
const byAccountOrder = (a: { accountKey: number; name: string }, b: { accountKey: number; name: string }): number => {
  if (a.accountKey === b.accountKey) return 0;
  if (a.accountKey === CASH_ACCOUNT_KEY) return -1;
  if (b.accountKey === CASH_ACCOUNT_KEY) return 1;
  return a.name.localeCompare(b.name, "es");
};

/**
 * Ingresos, egresos, transferencias y ajustes por cuenta en un rango (fechas de Lima,
 * inclusivas; sin `dateTo` = sin tope), de TODA la empresa (sin filtro de
 * tienda). Un rango vacío (desde > hasta) devuelve un mapa vacío.
 */
export async function loadFlowsByAccount(
  companyId: number,
  range: { dateFrom?: string; dateTo?: string },
  transaction?: Transaction
): Promise<Map<number, AccountFlowCents>> {
  if (range.dateFrom && range.dateTo && range.dateFrom > range.dateTo) return new Map();

  const summary = await getCashFlowSummary({
    companyId,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    transaction,
  });
  return new Map(
    summary.by_account.map((account): [number, AccountFlowCents] => {
      const accountKey = accountKeyOf(account.payment_account_id);
      return [
        accountKey,
        {
          accountKey,
          paymentAccountId: account.payment_account_id,
          name: account.payment_account_name,
          incomeCents: toCents(account.income),
          expenseCents: toCents(account.expense),
          transfersCents: toCents(account.transfers),
          adjustmentsCents: toCents(account.adjustments),
        },
      ];
    })
  );
}

/** Efecto neto de los movimientos de una cuenta en su saldo (céntimos con signo). */
export const flowNetCents = (flow: AccountFlowCents | undefined): number =>
  flow ? flow.incomeCents - flow.expenseCents + flow.transfersCents + flow.adjustmentsCents : 0;

/** Saldo inicial declarado (cash_ledger_opening) por cuenta. */
export async function loadDeclaredOpenings(
  ledgerId: number,
  transaction?: Transaction
): Promise<Map<number, DeclaredOpening>> {
  const rows = await DataBase.instance.cash_ledger_opening.findAll({ where: { cash_ledger_id: ledgerId }, transaction });
  return new Map(
    rows.map((row): [number, DeclaredOpening] => [
      Number(row.account_key),
      {
        accountKey: Number(row.account_key),
        paymentAccountId: row.payment_account_id === null ? null : Number(row.payment_account_id),
        name: row.account_name,
        cents: toCents(row.amount),
        historyCents: row.history_amount === null ? null : toCents(row.history_amount),
      },
    ])
  );
}

/** Saldos guardados de un mes cerrado (cash_period_balance), por cuenta. */
export async function loadStoredBalances(
  cashPeriodId: number,
  transaction?: Transaction
): Promise<Map<number, CashPeriodAccountBalance>> {
  const rows = await DataBase.instance.cash_period_balance.findAll({ where: { cash_period_id: cashPeriodId }, transaction });
  return new Map(
    rows.map((row): [number, CashPeriodAccountBalance] => [
      Number(row.account_key),
      {
        account_key: Number(row.account_key),
        payment_account_id: row.payment_account_id === null ? null : Number(row.payment_account_id),
        account_name: row.account_name,
        opening: Number(row.opening),
        income: Number(row.income),
        expense: Number(row.expense),
        transfers: Number(row.transfers ?? 0),
        adjustments: Number(row.adjustments),
        closing: Number(row.closing),
      },
    ])
  );
}

/** Nombre ACTUAL de cada cuenta (una consulta). Efectivo no está en la tabla. */
export async function loadAccountNames(ids: number[], transaction?: Transaction): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await DataBase.instance.sequelize.query<{ id: number | string; name: string | null }>(
    "SELECT id, name FROM general_variable WHERE id IN (:ids)",
    { type: QueryTypes.SELECT, replacements: { ids }, transaction }
  );
  return new Map(rows.map((row) => [Number(row.id), row.name ?? "Cuenta"]));
}

/**
 * Último mes de la cadena cerrada contigua desde el inicio (el "ancla" de los
 * saldos), opcionalmente solo entre los meses ANTERIORES a `beforePeriod`.
 * null = ningún mes cerrado en orden: la base es el saldo inicial.
 */
export function anchorPeriod(map: CashPeriodMap, beforePeriod?: string): string | null {
  if (!map.ledger) return null;
  let anchor: string | null = null;
  let candidate = map.ledger.startPeriod;
  // Cota explícita: nunca hay más meses cerrados que filas en el mapa.
  for (let step = 0; step <= map.periods.size; step += 1) {
    if (beforePeriod !== undefined && candidate >= beforePeriod) break;
    if (!isClosedPeriod(map, candidate)) break;
    anchor = candidate;
    candidate = shiftPeriod(candidate, 1);
  }
  return anchor;
}

interface RunningBase {
  anchor: string | null;
  base: Map<number, AccountAmountCents>;
  flows: Map<number, AccountFlowCents>;
}

/**
 * Base (cierre del ancla o saldo inicial) + movimientos posteriores al ancla,
 * hasta `untilDate` inclusive (sin tope si no se indica). Con `beforePeriod`,
 * el ancla se busca solo entre los meses anteriores (vista previa de un mes
 * abierto).
 */
async function runningBase(
  companyId: number,
  map: CashPeriodMap,
  options: { beforePeriod?: string; untilDate?: string },
  transaction?: Transaction
): Promise<RunningBase> {
  const ledger = map.ledger;
  if (!ledger) return { anchor: null, base: new Map(), flows: new Map() };

  const anchor = anchorPeriod(map, options.beforePeriod);
  const anchorState = anchor === null ? undefined : map.periods.get(anchor);
  const base = new Map<number, AccountAmountCents>();
  if (anchorState) {
    const stored = await loadStoredBalances(anchorState.id, transaction);
    stored.forEach((row, key) =>
      base.set(key, { accountKey: key, paymentAccountId: row.payment_account_id, name: row.account_name, cents: toCents(row.closing) })
    );
  } else {
    const declared = await loadDeclaredOpenings(ledger.id, transaction);
    declared.forEach((row, key) => base.set(key, { ...row }));
  }

  const dateFrom = anchor === null ? ledger.startDate : addDaysToDateOnly(periodBounds(anchor).end, 1);
  const flows = await loadFlowsByAccount(companyId, { dateFrom, dateTo: options.untilDate }, transaction);
  return { anchor, base, flows };
}

/**
 * Saldo inicial de cada cuenta para el mes `period`:
 *   - mes de inicio → saldo inicial declarado;
 *   - mes anterior cerrado → su cierre guardado (I2);
 *   - si no (vista previa de un mes que todavía no se puede cerrar) → ancla
 *     anterior + movimientos hasta el día previo al mes.
 */
async function openingBalancesFor(
  companyId: number,
  period: string,
  map: CashPeriodMap,
  transaction?: Transaction
): Promise<Map<number, AccountAmountCents>> {
  const ledger = map.ledger;
  if (!ledger) return new Map();

  if (period === ledger.startPeriod) {
    const declared = await loadDeclaredOpenings(ledger.id, transaction);
    return new Map([...declared].map(([key, row]) => [key, { ...row }]));
  }

  const previous = map.periods.get(shiftPeriod(period, -1));
  if (previous?.status === "closed") {
    const stored = await loadStoredBalances(previous.id, transaction);
    return new Map(
      [...stored].map(([key, row]) => [
        key,
        { accountKey: key, paymentAccountId: row.payment_account_id, name: row.account_name, cents: toCents(row.closing) },
      ])
    );
  }

  const { base, flows } = await runningBase(
    companyId,
    map,
    { beforePeriod: period, untilDate: addDaysToDateOnly(periodBounds(period).start, -1) },
    transaction
  );
  const keys = new Set([...base.keys(), ...flows.keys()]);
  return new Map(
    [...keys].map((key): [number, AccountAmountCents] => {
      const ref = base.get(key) ?? flows.get(key);
      return [
        key,
        {
          accountKey: key,
          paymentAccountId: ref?.paymentAccountId ?? null,
          name: ref?.name ?? CASH_ACCOUNT_NAME,
          cents: (base.get(key)?.cents ?? 0) + flowNetCents(flows.get(key)),
        },
      ];
    })
  );
}

// Nombre a mostrar: el actual de la cuenta; si ya no existe, el guardado.
const displayName = (ref: AccountRef, names: Map<number, string>): string => {
  if (ref.accountKey === CASH_ACCOUNT_KEY) return CASH_ACCOUNT_NAME;
  return names.get(ref.accountKey) ?? ref.name;
};

export const totalsOf = (balances: readonly CashPeriodAccountBalance[]): CashPeriodTotals => {
  if (balances.length === 0) return { ...ZERO_TOTALS };
  const sum = (pick: (row: CashPeriodAccountBalance) => number) =>
    fromCents(balances.reduce((total, row) => total + toCents(pick(row)), 0));
  return {
    opening: sum((row) => row.opening),
    income: sum((row) => row.income),
    expense: sum((row) => row.expense),
    transfers: sum((row) => row.transfers),
    adjustments: sum((row) => row.adjustments),
    closing: sum((row) => row.closing),
  };
};

export const snapshotOf = (period: string, balances: CashPeriodAccountBalance[]): CashPeriodSnapshot => ({
  period,
  totals: totalsOf(balances),
  balances,
});

/**
 * Saldos de un mes (vista previa o lo que se guarda al cerrar): cuentas = las
 * del saldo inicial ∪ las que tuvieron movimiento en el mes. Movimientos de
 * TODA la empresa, del primer al último día del mes.
 */
export async function computePeriodBalances(
  companyId: number,
  period: string,
  map: CashPeriodMap,
  transaction?: Transaction
): Promise<CashPeriodAccountBalance[]> {
  const opening = await openingBalancesFor(companyId, period, map, transaction);
  const { start, end } = periodBounds(period);
  const flows = await loadFlowsByAccount(companyId, { dateFrom: start, dateTo: end }, transaction);

  const keys = [...new Set([...opening.keys(), ...flows.keys()])];
  const names = await loadAccountNames(keys.filter((key) => key !== CASH_ACCOUNT_KEY), transaction);

  return keys
    .map((key) => {
      const ref = opening.get(key) ?? flows.get(key);
      const accountRef: AccountRef = {
        accountKey: key,
        paymentAccountId: key === CASH_ACCOUNT_KEY ? null : key,
        name: ref?.name ?? CASH_ACCOUNT_NAME,
      };
      const openingCents = opening.get(key)?.cents ?? 0;
      const flow = flows.get(key);
      return { ...accountRef, name: displayName(accountRef, names), openingCents, flow };
    })
    .sort(byAccountOrder)
    .map(({ accountKey, paymentAccountId, name, openingCents, flow }) => ({
      account_key: accountKey,
      payment_account_id: paymentAccountId,
      account_name: name,
      opening: fromCents(openingCents),
      income: fromCents(flow?.incomeCents ?? 0),
      expense: fromCents(flow?.expenseCents ?? 0),
      transfers: fromCents(flow?.transfersCents ?? 0),
      adjustments: fromCents(flow?.adjustmentsCents ?? 0),
      closing: fromCents(openingCents + flowNetCents(flow)),
    }));
}

// "Saldo inicial al 01/10/2026" | "Cierre de octubre 2026".
const baseLabelOf = (map: CashPeriodMap, anchor: string | null): string | null => {
  if (!map.ledger) return null;
  if (anchor === null) return `Saldo inicial al ${formatDateOnlyEsPe(map.ledger.startDate)}`;
  return `Cierre de ${formatPeriodEs(anchor)}`;
};

// Aviso cuando hay un mes reabierto: los saldos se calculan desde el último
// mes cerrado EN ORDEN, no desde los cerrados posteriores.
const provisionalNoteOf = (map: CashPeriodMap, anchor: string | null): string | null => {
  const reopened = [...map.periods.values()]
    .filter((state) => state.status === "reopened")
    .map((state) => state.period)
    .sort();
  const first = reopened[0];
  if (first === undefined) return null;
  const base = anchor === null ? "el saldo inicial" : `el último mes cerrado en orden (${formatPeriodEs(anchor)})`;
  return `${capitalizeEs(formatPeriodEs(first))} está reabierto: los saldos se calculan desde ${base}.`;
};

/**
 * Saldo actual por cuenta (GET /cash-closing/balances):
 *   base   = cierre del ancla (último mes de la cadena cerrada contigua) o el
 *            saldo inicial declarado;
 *   actual = base + ingresos − egresos + transferencias + ajustes con fecha posterior al ancla
 *            (sin tope: una fecha futura es imposible, moneyDateRule).
 * Es igual a saldo inicial + Σ neto de Caja desde el inicio (I4).
 */
export async function computeCurrentBalances(
  companyId: number,
  map: CashPeriodMap,
  today: string,
  transaction?: Transaction
): Promise<CashBalancesResponse> {
  if (!map.ledger) {
    return {
      started: false,
      as_of: today,
      base_period: null,
      base_label: null,
      provisional_note: null,
      accounts: [],
      totals: { base_balance: 0, income: 0, expense: 0, transfers: 0, adjustments: 0, current_balance: 0 },
    };
  }

  const { anchor, base, flows } = await runningBase(companyId, map, {}, transaction);
  const keys = [...new Set([...base.keys(), ...flows.keys()])];
  const names = await loadAccountNames(keys.filter((key) => key !== CASH_ACCOUNT_KEY), transaction);

  const accounts = keys
    .map((key) => {
      const ref = base.get(key) ?? flows.get(key);
      const accountRef: AccountRef = {
        accountKey: key,
        paymentAccountId: key === CASH_ACCOUNT_KEY ? null : key,
        name: ref?.name ?? CASH_ACCOUNT_NAME,
      };
      return { ...accountRef, name: displayName(accountRef, names), baseCents: base.get(key)?.cents ?? 0, flow: flows.get(key) };
    })
    .sort(byAccountOrder)
    .map(
      ({ accountKey, paymentAccountId, name, baseCents, flow }): CashBalanceAccount => ({
        account_key: accountKey,
        payment_account_id: paymentAccountId,
        name,
        base_balance: fromCents(baseCents),
        income: fromCents(flow?.incomeCents ?? 0),
        expense: fromCents(flow?.expenseCents ?? 0),
        transfers: fromCents(flow?.transfersCents ?? 0),
        adjustments: fromCents(flow?.adjustmentsCents ?? 0),
        current_balance: fromCents(baseCents + flowNetCents(flow)),
      })
    );

  const sum = (pick: (row: CashBalanceAccount) => number) =>
    fromCents(accounts.reduce((total, row) => total + toCents(pick(row)), 0));

  return {
    started: true,
    as_of: today,
    base_period: anchor,
    base_label: baseLabelOf(map, anchor),
    provisional_note: provisionalNoteOf(map, anchor),
    accounts,
    totals: {
      base_balance: sum((row) => row.base_balance),
      income: sum((row) => row.income),
      expense: sum((row) => row.expense),
      transfers: sum((row) => row.transfers),
      adjustments: sum((row) => row.adjustments),
      current_balance: sum((row) => row.current_balance),
    },
  };
}
