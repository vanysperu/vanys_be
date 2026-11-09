import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { fromCents } from "../../../../../core/utils/money";
import { addDaysToDateOnly, periodBounds, periodOf, shiftPeriod, todayInBusinessTz } from "../../../../../utils/dateUtils";
import { PAYMENT_ACCOUNT_CATEGORY } from "../../../variable_general/services/shared/payment_account.service";
import { CASH_ACCOUNT_KEY, CASH_ACCOUNT_NAME, CashOpeningAccount, CashOpeningResponse } from "../../types/cash_closing.types";
import { CashPeriodMap, loadPeriodMap } from "../shared/period_state.service";
import { flowNetCents, loadDeclaredOpenings, loadFlowsByAccount } from "../shared/balances.service";

export interface CompanyPaymentAccount {
  id: number;
  name: string;
  active: boolean;
}

/** Cuentas de la empresa (activas y deshabilitadas), una consulta. */
export async function loadCompanyPaymentAccounts(
  companyId: number,
  transaction?: Transaction
): Promise<Map<number, CompanyPaymentAccount>> {
  const rows = await DataBase.instance.sequelize.query<{ id: number | string; name: string | null; is_deleted: number | boolean }>(
    "SELECT id, name, is_deleted FROM general_variable WHERE category = :category AND company_id = :companyId",
    { type: QueryTypes.SELECT, replacements: { category: PAYMENT_ACCOUNT_CATEGORY, companyId }, transaction }
  );
  return new Map(
    rows.map((row) => [Number(row.id), { id: Number(row.id), name: row.name ?? "Cuenta", active: !Number(row.is_deleted) }])
  );
}

// Mes de inicio sugerido: el último mes terminado (decisión del usuario).
export const suggestedStartPeriod = (today: string): string => shiftPeriod(periodOf(today), -1);

// El mes de inicio solo cambia mientras no hay ningún mes cerrado nunca.
export const isStartPeriodEditable = (map: CashPeriodMap): boolean => !map.ledger || map.periods.size === 0;

// Los montos se editan mientras el mes de inicio no está cerrado (o está reabierto).
export const isOpeningEditable = (map: CashPeriodMap): boolean => {
  if (!map.ledger) return true;
  return map.periods.get(map.ledger.startPeriod)?.status !== "closed";
};

/**
 * Saldo inicial de la caja (GET /cash-closing/opening): el mes de inicio (el
 * guardado o el sugerido), lo declarado por cuenta y, como PISTA, el neto de
 * Caja de cada cuenta antes de esa fecha ("Usar este valor"). La pista nunca
 * se guarda como saldo sola: el historial suele estar incompleto.
 *
 * `requestedStartPeriod`: para ver las pistas de otro mes en el selector
 * "Mes de inicio" (solo si el mes todavía se puede cambiar).
 */
export async function getCashOpening(companyId: number, requestedStartPeriod?: string): Promise<CashOpeningResponse> {
  const today = todayInBusinessTz();
  const map = await loadPeriodMap(companyId);
  const startPeriodEditable = isStartPeriodEditable(map);
  const startPeriod =
    startPeriodEditable && requestedStartPeriod
      ? requestedStartPeriod
      : (map.ledger?.startPeriod ?? suggestedStartPeriod(today));
  const startDate = periodBounds(startPeriod).start;

  const [declared, history, companyAccounts] = await Promise.all([
    map.ledger ? loadDeclaredOpenings(map.ledger.id) : Promise.resolve(new Map()),
    loadFlowsByAccount(companyId, { dateTo: addDaysToDateOnly(startDate, -1) }),
    loadCompanyPaymentAccounts(companyId),
  ]);

  // Efectivo + cuentas activas + cualquier cuenta (aunque esté deshabilitada)
  // con historia o con saldo declarado.
  const keys = new Set<number>([
    CASH_ACCOUNT_KEY,
    ...[...companyAccounts.values()].filter((account) => account.active).map((account) => account.id),
    ...declared.keys(),
    ...history.keys(),
  ]);

  const accounts = [...keys]
    .map((key): CashOpeningAccount => {
      const flow = history.get(key);
      const account = companyAccounts.get(key);
      const opening = declared.get(key);
      return {
        account_key: key,
        payment_account_id: key === CASH_ACCOUNT_KEY ? null : key,
        name: key === CASH_ACCOUNT_KEY ? CASH_ACCOUNT_NAME : (account?.name ?? opening?.name ?? flow?.name ?? "Cuenta"),
        active: key === CASH_ACCOUNT_KEY || (account?.active ?? false),
        amount: opening ? fromCents(opening.cents) : null,
        history_amount: fromCents(flowNetCents(flow)),
      };
    })
    .sort((a, b) => {
      if (a.account_key === CASH_ACCOUNT_KEY) return -1;
      if (b.account_key === CASH_ACCOUNT_KEY) return 1;
      return a.name.localeCompare(b.name, "es");
    });

  return {
    started: map.ledger !== null,
    start_period: startPeriod,
    start_date: startDate,
    notes: map.ledger?.notes ?? null,
    editable: isOpeningEditable(map),
    start_period_editable: startPeriodEditable,
    accounts,
  };
}
