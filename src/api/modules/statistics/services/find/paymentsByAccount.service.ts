import { PaymentsByAccountItem, StatisticsPeriod, StatisticsScope } from "../../types/statistics.types";
import { MONEY_SCOPE_SQL, scopeReplacements, selectRows, toCount, toMoney } from "../shared/scope";

// Más de 6 barras ya no se comparan bien: el resto se junta en "Otras cuentas".
const MAX_ACCOUNTS = 6;
const CASH_PAYMENT_METHOD = "cash";

interface AccountRow {
  label: string;
  amount: unknown;
  count: unknown;
}

// ¿A dónde entró la plata cobrada en el periodo? Por cuenta (banco, Yape,
// Plin) o en efectivo.
export async function getPaymentsByAccountService(
  scope: StatisticsScope,
  period: StatisticsPeriod
): Promise<PaymentsByAccountItem[]> {
  const rows = await selectRows<AccountRow>(
    `SELECT CASE
              WHEN qp.payment_account_id IS NOT NULL THEN pa.name
              WHEN qp.method = :cash THEN 'Efectivo'
              ELSE 'Sin cuenta indicada'
            END AS label,
            COALESCE(SUM(qp.amount), 0) AS amount,
            COUNT(*) AS count
     FROM quotation_payment qp
     INNER JOIN quotation q ON q.id = qp.quotation_id
     LEFT JOIN general_variable pa ON pa.id = qp.payment_account_id
     WHERE qp.is_deleted = false AND ${MONEY_SCOPE_SQL} AND qp.paid_at BETWEEN :from AND :to
     GROUP BY label
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
