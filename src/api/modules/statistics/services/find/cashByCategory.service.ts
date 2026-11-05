import { CashByCategory, CategoryAmount, StatisticsPeriod, StatisticsScope } from "../../types/statistics.types";
import { CASH_SCOPE_SQL, MONEY_SCOPE_SQL, scopeReplacements, selectRows, toMoney } from "../shared/scope";
import {
  ADJUSTMENT_ENTRY_SCOPE_SQL,
  EXPENSE_ACTIVE_SQL,
  EXPENSE_FUNDING_JOIN_SQL,
  EXPENSE_PAID_BY_COMPANY_SQL,
  REIMBURSEMENT_ALLOCATIONS_FROM_SQL,
  REIMBURSEMENT_SCOPE_SQL,
} from "../../../cash_movement/services/shared/cash_flow.sql";

interface SumRow {
  amount: unknown;
}

interface ExpenseSplitRow {
  purchases: unknown;
  others: unknown;
}

interface ManualRow {
  direction: "income" | "expense";
  category: string | null;
  amount: unknown;
}

interface LegRow {
  income: unknown;
  expense: unknown;
}

interface CatalogRow {
  prefix_id: string;
  name: string;
  company_id: number | null;
}

const CLOSED_MONTHS_LABEL = "Valores de meses cerrados";

// Mayor a menor, sin categorías en cero.
const ranked = (items: CategoryAmount[]): CategoryAmount[] =>
  items.filter((item) => item.amount !== 0).sort((left, right) => right.amount - left.amount);

/**
 * Ingresos y egresos del periodo por categoría (pedido explícito del usuario:
 * "una gráfica donde se vean los ingresos y egresos según su categoría").
 * Mismas fuentes y filtros que los KPIs de caja (kpis.service.ts), así la suma
 * de cada lado cuadra con "Ingresos" y "Egresos" del tablero y con Caja.
 */
export async function getCashByCategoryService(scope: StatisticsScope, period: StatisticsPeriod): Promise<CashByCategory> {
  const replacements = { ...scopeReplacements(scope), from: period.date_from, to: period.date_to };

  const [[payments], [expenses], [reimbursements], manual, [legs]] = await Promise.all([
    selectRows<SumRow>(
      `SELECT COALESCE(SUM(qp.amount), 0) AS amount
       FROM quotation_payment qp
       INNER JOIN quotation q ON q.id = qp.quotation_id
       WHERE qp.is_deleted = false AND ${MONEY_SCOPE_SQL} AND qp.paid_at BETWEEN :from AND :to`,
      replacements
    ),
    // Gastos de cotizaciones que pagó la empresa: compras (las de órdenes de
    // compra) aparte del resto.
    selectRows<ExpenseSplitRow>(
      `SELECT COALESCE(SUM(CASE WHEN fpop.id IS NOT NULL THEN qe.amount ELSE 0 END), 0) AS purchases,
              COALESCE(SUM(CASE WHEN fpop.id IS NULL THEN qe.amount ELSE 0 END), 0) AS others
       FROM quotation_expense qe
       INNER JOIN quotation q ON q.id = qe.quotation_id
       ${EXPENSE_FUNDING_JOIN_SQL}
       WHERE ${MONEY_SCOPE_SQL} AND ${EXPENSE_ACTIVE_SQL} AND ${EXPENSE_PAID_BY_COMPANY_SQL} AND qe.spent_at BETWEEN :from AND :to`,
      replacements
    ),
    selectRows<SumRow>(
      `SELECT COALESCE(SUM(a.amount), 0) AS amount
       FROM ${REIMBURSEMENT_ALLOCATIONS_FROM_SQL}
       WHERE ${REIMBURSEMENT_SCOPE_SQL} AND p.paid_at BETWEEN :from AND :to`,
      replacements
    ),
    selectRows<ManualRow>(
      `SELECT cm.direction, cm.category, COALESCE(SUM(cm.amount), 0) AS amount
       FROM cash_movement cm
       WHERE ${CASH_SCOPE_SQL} AND cm.occurred_at BETWEEN :from AND :to
       GROUP BY cm.direction, cm.category`,
      replacements
    ),
    // "Valor al cierre" de meses cerrados (con signo), igual que en los KPIs.
    selectRows<LegRow>(
      `SELECT COALESCE(SUM(CASE WHEN e.leg = 'hold' AND e.direction = 'income' THEN e.amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN e.leg = 'hold' AND e.direction = 'expense' THEN e.amount ELSE 0 END), 0) AS expense
       FROM cash_adjustment_entry e
       WHERE ${ADJUSTMENT_ENTRY_SCOPE_SQL} AND e.entry_date BETWEEN :from AND :to`,
      replacements
    ),
  ]);

  // Nombre de cada categoría manual (catálogo "Tipos de movimiento"): la de la
  // empresa pisa a la global con el mismo código.
  const codes = [...new Set(manual.map((row) => row.category).filter((code): code is string => Boolean(code)))];
  const catalog =
    codes.length === 0
      ? []
      : await selectRows<CatalogRow>(
          `SELECT prefix_id, name, company_id FROM general_variable
           WHERE category = 'cash_movement_type' AND prefix_id IN (:codes)
             AND (company_id IS NULL OR (:companyId IS NOT NULL AND company_id = :companyId))`,
          { codes, companyId: scope.companyId }
        );
  const labelOf = (code: string | null, fallback: string): string => {
    if (!code) return fallback;
    const own = catalog.find((row) => row.prefix_id === code && row.company_id !== null);
    const global = catalog.find((row) => row.prefix_id === code && row.company_id === null);
    return own?.name ?? global?.name ?? code;
  };
  const manualOf = (direction: ManualRow["direction"], fallback: string): CategoryAmount[] =>
    manual
      .filter((row) => row.direction === direction)
      .map((row) => ({ key: `manual:${row.category ?? ""}`, label: labelOf(row.category, fallback), amount: toMoney(row.amount) }));

  return {
    income: ranked([
      { key: "client_payments", label: "Pagos de clientes", amount: toMoney(payments?.amount) },
      ...manualOf("income", "Otros ingresos"),
      { key: "closed_months", label: CLOSED_MONTHS_LABEL, amount: toMoney(legs?.income) },
    ]),
    expenses: ranked([
      { key: "purchases", label: "Compras", amount: toMoney(expenses?.purchases) },
      { key: "quotation_expenses", label: "Gastos", amount: toMoney(expenses?.others) },
      { key: "reimbursements", label: "Reposiciones a trabajadores", amount: toMoney(reimbursements?.amount) },
      ...manualOf("expense", "Otros egresos"),
      { key: "closed_months", label: CLOSED_MONTHS_LABEL, amount: toMoney(legs?.expense) },
    ]),
  };
}
