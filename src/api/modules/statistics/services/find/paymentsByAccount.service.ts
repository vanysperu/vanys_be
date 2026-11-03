import { PaymentsByAccountItem, StatisticsPeriod, StatisticsScope } from "../../types/statistics.types";
import { MONEY_SCOPE_SQL, scopeReplacements, selectRows, toCount, toMoney } from "../shared/scope";
import { ADJUSTMENT_ENTRY_SCOPE_SQL } from "../../../cash_movement/services/shared/cash_flow.sql";

// Más de 6 barras ya no se comparan bien: el resto se junta en "Otras cuentas".
const MAX_ACCOUNTS = 6;
const CASH_PAYMENT_METHOD = "cash";

interface AccountRow {
  label: string;
  amount: unknown;
  count: unknown;
}

// ¿A dónde entró la plata cobrada en el periodo? Por cuenta (banco, Yape,
// Plin) o en efectivo. Incluye las patas "Valor al cierre" de pagos (cierre
// de caja): un mes cerrado sigue mostrando por cuenta lo que se cerró aunque
// después se corrija un pago. Esas patas no cuentan como pagos (count 0).
// Un hold sin cuenta se etiqueta con la MISMA regla que un pago vivo, usando el
// método del pago de origen (la pata no guarda el método): efectivo →
// 'Efectivo', otro → 'Sin cuenta indicada'. Limitación: es el método ACTUAL
// del pago; si el método también se corrigió, el hold viejo toma el nuevo
// (ver README).
export async function getPaymentsByAccountService(
  scope: StatisticsScope,
  period: StatisticsPeriod
): Promise<PaymentsByAccountItem[]> {
  const rows = await selectRows<AccountRow>(
    `SELECT movement.label, COALESCE(SUM(movement.amount), 0) AS amount, COALESCE(SUM(movement.counted), 0) AS count
     FROM (
       SELECT CASE
                WHEN qp.payment_account_id IS NOT NULL THEN pa.name
                WHEN qp.method = :cash THEN 'Efectivo'
                ELSE 'Sin cuenta indicada'
              END AS label,
              qp.amount AS amount,
              1 AS counted
       FROM quotation_payment qp
       INNER JOIN quotation q ON q.id = qp.quotation_id
       LEFT JOIN general_variable pa ON pa.id = qp.payment_account_id
       WHERE qp.is_deleted = false AND ${MONEY_SCOPE_SQL} AND qp.paid_at BETWEEN :from AND :to
       UNION ALL
       SELECT CASE
                WHEN e.payment_account_id IS NOT NULL THEN pa.name
                WHEN source_qp.method = :cash THEN 'Efectivo'
                ELSE 'Sin cuenta indicada'
              END AS label,
              e.amount AS amount,
              0 AS counted
       FROM cash_adjustment_entry e
       LEFT JOIN general_variable pa ON pa.id = e.payment_account_id
       LEFT JOIN quotation_payment source_qp ON source_qp.id = e.source_id
       WHERE e.leg = 'hold' AND e.source_type = 'quotation_payment' AND ${ADJUSTMENT_ENTRY_SCOPE_SQL}
         AND e.entry_date BETWEEN :from AND :to
     ) movement
     GROUP BY movement.label
     HAVING SUM(movement.amount) <> 0 OR SUM(movement.counted) > 0
     ORDER BY amount DESC`,
    { ...scopeReplacements(scope), from: period.date_from, to: period.date_to, cash: CASH_PAYMENT_METHOD }
  );

  const items = rows.map((row) => ({ label: row.label, amount: toMoney(row.amount), count: toCount(row.count) }));
  if (items.length <= MAX_ACCOUNTS) return items;

  const head = items.slice(0, MAX_ACCOUNTS - 1);
  const tail = items.slice(MAX_ACCOUNTS - 1);
  return [
    ...head,
    {
      label: "Otras cuentas",
      amount: toMoney(tail.reduce((sum, item) => sum + item.amount, 0)),
      count: tail.reduce((sum, item) => sum + item.count, 0),
    },
  ];
}
