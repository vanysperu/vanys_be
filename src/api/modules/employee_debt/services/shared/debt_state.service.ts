import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

// Lo repuesto vigente de una deuda = suma de sus asignaciones de reposiciones
// NO anuladas (employee_debt_payment.is_deleted = false). Las asignaciones de
// una reposición anulada se conservan (historial) pero ya no cuentan.
const ACTIVE_PAID_SQL = `(
  SELECT COALESCE(SUM(a.amount), 0)
  FROM employee_debt_payment_allocation a
  INNER JOIN employee_debt_payment p ON p.id = a.employee_debt_payment_id
  WHERE a.employee_debt_id = ed.id AND p.is_deleted = false
)`;

// Día de la última reposición vigente que cubrió la deuda (NULL si ninguna).
const LAST_ACTIVE_PAID_AT_SQL = `(
  SELECT MAX(p.paid_at)
  FROM employee_debt_payment_allocation a
  INNER JOIN employee_debt_payment p ON p.id = a.employee_debt_payment_id
  WHERE a.employee_debt_id = ed.id AND p.is_deleted = false
)`;

/**
 * Recalcula desde la fuente (nunca con deltas) el estado cacheado de las
 * deudas indicadas: paid_amount, status y paid_at.
 *
 *   paid_amount = Σ asignaciones vigentes
 *   status      = 'cancelled' se conserva; si no, 'paid' cuando lo repuesto
 *                 cubre el monto, 'pending' en otro caso
 *   paid_at     = MAX(paid_at) de las reposiciones vigentes
 *
 * Una sola sentencia UPDATE de UNA tabla (las subconsultas leen otras
 * tablas, así que MySQL no la rechaza por "target table in FROM"). El estado
 * se calcula con la MISMA subconsulta y no leyendo `paid_amount` recién
 * asignado: MySQL evalúa el SET de izquierda a derecha, pero MariaDB con
 * SIMULTANEOUS_ASSIGNMENT no — así el resultado es el mismo en ambas.
 *
 * Usa `amount` ya guardado: si el caller corrige el monto de la deuda, lo
 * actualiza ANTES de llamar a esto. Si lo repuesto quedara por encima del
 * monto, el CHECK chk_employee_debt_paid_amount hace fallar la sentencia (y
 * la transacción entera): el caller lo valida antes con un 409 legible.
 *
 * Se llama dentro de la transacción del caller, con las deudas ya
 * bloqueadas (FOR UPDATE).
 */
export async function recalculateDebtsState(
  debtIds: readonly number[],
  transaction: Transaction,
  updatedBy: number
): Promise<void> {
  if (debtIds.length === 0) return;

  await DataBase.instance.sequelize.query(
    `UPDATE employee_debt ed
     SET ed.paid_amount = ${ACTIVE_PAID_SQL},
         ed.status = CASE
           WHEN ed.status = 'cancelled' THEN 'cancelled'
           WHEN ${ACTIVE_PAID_SQL} >= ed.amount THEN 'paid'
           ELSE 'pending'
         END,
         ed.paid_at = ${LAST_ACTIVE_PAID_AT_SQL},
         ed.updated_by = :updatedBy,
         ed.updated_at = :now
     WHERE ed.id IN (:debtIds)`,
    {
      type: QueryTypes.UPDATE,
      replacements: { debtIds: [...new Set(debtIds)], updatedBy, now: nowUtc() },
      transaction,
    }
  );
}
