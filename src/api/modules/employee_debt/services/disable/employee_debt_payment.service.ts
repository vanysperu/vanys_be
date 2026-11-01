import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { formatSoles } from "../../../../../core/utils/money";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";

export class EmployeeDebtPaymentNotFoundError extends Error {}
export class EmployeeDebtPaymentAlreadyVoidedError extends Error {}

// Anula una reposición registrada por error. Es de una sola vía (no se
// "reactiva"): si después sí correspondía, se registra una reposición nueva,
// que vuelve a validar contra lo pendiente en ese momento — reactivar una
// vieja podía reponer de más.
//
// En una sola transacción, con la reposición y sus deudas bloqueadas:
//   - cada deuda recupera exactamente lo que esta reposición le había
//     cubierto (sus asignaciones) y vuelve a "pendiente";
//   - la fecha del último abono de esas deudas se recalcula con las
//     reposiciones que siguen vigentes;
//   - queda una fila inmutable en `log` (Caja es un libro contable: mismo
//     criterio que anular un movimiento manual).
const voidEmployeeDebtPayment = async ({
  paymentId,
  companyId,
  voidedBy,
}: {
  paymentId: number;
  // null = Super Administrador (cualquier empresa).
  companyId: number | null;
  voidedBy: number;
}) => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const payment = await DataBase.instance.employee_debt_payment.findOne({
      where: { id: paymentId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    // Otra empresa responde igual que "no existe": no se confirma que el id exista.
    if (!payment || (companyId !== null && payment.company_id !== companyId)) {
      throw new EmployeeDebtPaymentNotFoundError("La reposición no existe");
    }
    if (payment.is_deleted) throw new EmployeeDebtPaymentAlreadyVoidedError("Esta reposición ya está anulada");

    const allocations = await DataBase.instance.employee_debt_payment_allocation.findAll({
      where: { employee_debt_payment_id: paymentId },
      transaction,
    });
    const debtIds = allocations.map((allocation) => allocation.employee_debt_id);
    const now = nowUtc();

    if (debtIds.length > 0) {
      // Bloqueo explícito de las deudas antes de tocarlas (mismo orden que
      // al reponer): una reposición simultánea al mismo trabajador espera.
      await DataBase.instance.employee_debt.findAll({ where: { id: debtIds }, transaction, lock: transaction.LOCK.UPDATE });

      await DataBase.instance.sequelize.query(
        `UPDATE employee_debt ed
         INNER JOIN employee_debt_payment_allocation a
           ON a.employee_debt_id = ed.id AND a.employee_debt_payment_id = :paymentId
         SET ed.paid_amount = GREATEST(ed.paid_amount - a.amount, 0),
             ed.status = 'pending',
             ed.updated_by = :voidedBy,
             ed.updated_at = :now`,
        { type: QueryTypes.UPDATE, replacements: { paymentId, voidedBy, now }, transaction }
      );
    }

    await payment.update({ is_deleted: true, updated_by: voidedBy, updated_at: now }, { transaction });

    if (debtIds.length > 0) {
      // Último abono vigente de cada deuda (o NULL si ya no le queda ninguno).
      await DataBase.instance.sequelize.query(
        `UPDATE employee_debt ed
         SET ed.paid_at = (
           SELECT MAX(p.paid_at)
           FROM employee_debt_payment_allocation a
           INNER JOIN employee_debt_payment p ON p.id = a.employee_debt_payment_id
           WHERE a.employee_debt_id = ed.id AND p.is_deleted = false
         )
         WHERE ed.id IN (:debtIds)`,
        { type: QueryTypes.UPDATE, replacements: { debtIds }, transaction }
      );
    }

    await createLogService(
      {
        user_id: voidedBy,
        action: LogAction.DISABLE,
        module: "employee_debt",
        description: `Anuló la reposición #${paymentId} de ${formatSoles(payment.amount)} al trabajador #${payment.user_id} (del ${payment.paid_at})`,
        company_id: payment.company_id,
      },
      transaction
    );

    return { id: paymentId, is_deleted: true };
  });
};

export { voidEmployeeDebtPayment };
