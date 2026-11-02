import { KpiValues, StatisticsScope } from "../../types/statistics.types";
import {
  CASH_SCOPE_SQL,
  EMISSION_DATE_SQL,
  MONEY_SCOPE_SQL,
  QUOTATION_SCOPE_SQL,
  ratio,
  scopeReplacements,
  selectRows,
  toCount,
  toMoney,
} from "../shared/scope";
import {
  ADJUSTMENT_ENTRY_SCOPE_SQL,
  EXPENSE_ACTIVE_SQL,
  EXPENSE_FUNDING_JOIN_SQL,
  EXPENSE_PAID_BY_COMPANY_SQL,
  REIMBURSEMENT_ALLOCATIONS_FROM_SQL,
  REIMBURSEMENT_SCOPE_SQL,
} from "../../../cash_movement/services/shared/cash_flow.sql";

interface QuotationTotalsRow {
  quoted_count: unknown;
  quoted_amount: unknown;
  won_count: unknown;
  won_amount: unknown;
  won_subtotal: unknown;
  lost_count: unknown;
  pending_count: unknown;
}

interface SumRow {
  total: unknown;
}

interface ManualCashRow {
  income: unknown;
  expense: unknown;
}

interface AdjustmentLegsRow {
  collected: unknown;
  other_income: unknown;
  expenses: unknown;
  adjustments: unknown;
}

// Patas de ajuste del cierre de caja con fecha en el rango (mismo criterio
// que Caja): las "hold" (Valor al cierre) se suman a cobrado / otros ingresos
// / egresos según su fuente y sentido, con signo; las "posting" (Ajuste) van
// a `adjustments` con su efecto en el saldo. Así un mes cerrado muestra lo
// mismo que al cerrarse y net_cash = neto de Caja.
const ADJUSTMENT_LEGS_SQL = `SELECT
    COALESCE(SUM(CASE WHEN e.leg = 'hold' AND e.source_type = 'quotation_payment' THEN e.amount ELSE 0 END), 0) AS collected,
    COALESCE(SUM(CASE WHEN e.leg = 'hold' AND e.source_type <> 'quotation_payment' AND e.direction = 'income'
                      THEN e.amount ELSE 0 END), 0) AS other_income,
    COALESCE(SUM(CASE WHEN e.leg = 'hold' AND e.direction = 'expense' THEN e.amount ELSE 0 END), 0) AS expenses,
    COALESCE(SUM(CASE WHEN e.leg = 'posting' AND e.direction = 'income' THEN e.amount
                      WHEN e.leg = 'posting' THEN -e.amount ELSE 0 END), 0) AS adjustments
  FROM cash_adjustment_entry e
  WHERE ${ADJUSTMENT_ENTRY_SCOPE_SQL} AND e.entry_date BETWEEN :from AND :to`;

// Indicadores de un rango [from, to] (fechas de Lima). Se llama dos veces:
// para el periodo elegido y para el anterior, y así comparar.
export async function getKpisService(scope: StatisticsScope, from: string, to: string): Promise<KpiValues> {
  const replacements = { ...scopeReplacements(scope), from, to };

  const [[quotations], [linkedExpenses], [collected], [quotationExpenses], [reimbursements], [manualCash], [legs]] = await Promise.all([
    // Cotizaciones emitidas en el rango, por resultado.
    selectRows<QuotationTotalsRow>(
      `SELECT COUNT(*) AS quoted_count,
              COALESCE(SUM(q.total), 0) AS quoted_amount,
              COALESCE(SUM(q.status IN (:won)), 0) AS won_count,
              COALESCE(SUM(CASE WHEN q.status IN (:won) THEN q.total ELSE 0 END), 0) AS won_amount,
              COALESCE(SUM(CASE WHEN q.status IN (:won) THEN q.subtotal ELSE 0 END), 0) AS won_subtotal,
              COALESCE(SUM(q.status IN (:lost)), 0) AS lost_count,
              COALESCE(SUM(q.status = 'pending'), 0) AS pending_count
       FROM quotation q
       WHERE ${QUOTATION_SCOPE_SQL} AND ${EMISSION_DATE_SQL} BETWEEN :from AND :to`,
      replacements
    ),
    // Gastos cargados en las cotizaciones ganadas del rango (para el margen).
    selectRows<SumRow>(
      `SELECT COALESCE(SUM(qe.amount), 0) AS total
       FROM quotation_expense qe
       INNER JOIN quotation q ON q.id = qe.quotation_id
       WHERE ${QUOTATION_SCOPE_SQL} AND ${EXPENSE_ACTIVE_SQL} AND q.status IN (:won) AND ${EMISSION_DATE_SQL} BETWEEN :from AND :to`,
      replacements
    ),
    // Caja: pagos de clientes con fecha de pago en el rango.
    selectRows<SumRow>(
      `SELECT COALESCE(SUM(qp.amount), 0) AS total
       FROM quotation_payment qp
       INNER JOIN quotation q ON q.id = qp.quotation_id
       WHERE qp.is_deleted = false AND ${MONEY_SCOPE_SQL} AND qp.paid_at BETWEEN :from AND :to`,
      replacements
    ),
    // Caja: gastos de cotizaciones que pagó la EMPRESA (una compra pagada con
    // plata de un trabajador sale de caja recién al reponerle).
    selectRows<SumRow>(
      `SELECT COALESCE(SUM(qe.amount), 0) AS total
       FROM quotation_expense qe
       INNER JOIN quotation q ON q.id = qe.quotation_id
       ${EXPENSE_FUNDING_JOIN_SQL}
       WHERE ${MONEY_SCOPE_SQL} AND ${EXPENSE_ACTIVE_SQL} AND ${EXPENSE_PAID_BY_COMPANY_SQL} AND qe.spent_at BETWEEN :from AND :to`,
      replacements
    ),
    // Caja: reposiciones a trabajadores en el rango (mismo alcance que Caja).
    selectRows<SumRow>(
      `SELECT COALESCE(SUM(a.amount), 0) AS total
       FROM ${REIMBURSEMENT_ALLOCATIONS_FROM_SQL}
       WHERE ${REIMBURSEMENT_SCOPE_SQL} AND p.paid_at BETWEEN :from AND :to`,
      replacements
    ),
    // Caja: ingresos y egresos manuales.
    selectRows<ManualCashRow>(
      `SELECT COALESCE(SUM(CASE WHEN cm.direction = 'income' THEN cm.amount ELSE 0 END), 0) AS income,
              COALESCE(SUM(CASE WHEN cm.direction = 'expense' THEN cm.amount ELSE 0 END), 0) AS expense
       FROM cash_movement cm
       WHERE ${CASH_SCOPE_SQL} AND cm.occurred_at BETWEEN :from AND :to`,
      replacements
    ),
    // Cierre de caja: patas de ajuste (ver ADJUSTMENT_LEGS_SQL).
    selectRows<AdjustmentLegsRow>(ADJUSTMENT_LEGS_SQL, replacements),
  ]);

  const wonCount = toCount(quotations?.won_count);
  const wonAmount = toMoney(quotations?.won_amount);
  const wonSubtotal = toMoney(quotations?.won_subtotal);
  const lostCount = toCount(quotations?.lost_count);
  const collectedAmount = toMoney(toMoney(collected?.total) + toMoney(legs?.collected));
  const otherIncome = toMoney(toMoney(manualCash?.income) + toMoney(legs?.other_income));
  const expenses = toMoney(
    toMoney(quotationExpenses?.total) +
      toMoney(reimbursements?.total) +
      toMoney(manualCash?.expense) +
      toMoney(legs?.expenses)
  );
  const adjustments = toMoney(legs?.adjustments);
  const marginAmount = toMoney(wonSubtotal - toMoney(linkedExpenses?.total));

  return {
    quoted_amount: toMoney(quotations?.quoted_amount),
    quoted_count: toCount(quotations?.quoted_count),
    won_amount: wonAmount,
    won_count: wonCount,
    lost_count: lostCount,
    pending_count: toCount(quotations?.pending_count),
    conversion_rate: ratio(wonCount, wonCount + lostCount),
    average_ticket: wonCount > 0 ? toMoney(wonAmount / wonCount) : null,
    collected: collectedAmount,
    other_income: otherIncome,
    expenses,
    adjustments,
    net_cash: toMoney(collectedAmount + otherIncome - expenses + adjustments),
    margin_amount: marginAmount,
    margin_rate: ratio(marginAmount, wonSubtotal),
  };
}
