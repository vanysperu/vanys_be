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

// Indicadores de un rango [from, to] (fechas de Lima). Se llama dos veces:
// para el periodo elegido y para el anterior, y así comparar.
export async function getKpisService(scope: StatisticsScope, from: string, to: string): Promise<KpiValues> {
  const replacements = { ...scopeReplacements(scope), from, to };

  const [[quotations], [linkedExpenses], [collected], [quotationExpenses], [manualCash]] = await Promise.all([
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
       WHERE ${QUOTATION_SCOPE_SQL} AND q.status IN (:won) AND ${EMISSION_DATE_SQL} BETWEEN :from AND :to`,
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
    // Caja: gastos de cotizaciones (compras, etc.) con fecha en el rango.
    selectRows<SumRow>(
      `SELECT COALESCE(SUM(qe.amount), 0) AS total
       FROM quotation_expense qe
       INNER JOIN quotation q ON q.id = qe.quotation_id
       WHERE ${MONEY_SCOPE_SQL} AND qe.spent_at BETWEEN :from AND :to`,
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
  ]);

  const wonCount = toCount(quotations?.won_count);
  const wonAmount = toMoney(quotations?.won_amount);
  const wonSubtotal = toMoney(quotations?.won_subtotal);
  const lostCount = toCount(quotations?.lost_count);
  const collectedAmount = toMoney(collected?.total);
  const otherIncome = toMoney(manualCash?.income);
  const expenses = toMoney(toMoney(quotationExpenses?.total) + toMoney(manualCash?.expense));
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
    net_cash: toMoney(collectedAmount + otherIncome - expenses),
    margin_amount: marginAmount,
    margin_rate: ratio(marginAmount, wonSubtotal),
  };
}
