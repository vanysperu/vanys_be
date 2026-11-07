import { DataBase } from "../../../../../database";
import { nowUtc, todayInBusinessTz } from "../../../../../utils/dateUtils";
import { formatSoles, fromCents, toCents } from "../../../../../core/utils/money";
import { WriteScope } from "../../../../../core/rbac/writeScope";
import { assertCashPeriodOpen } from "../../../../../core/money/cashPeriod";
import { filterDebtsInWriteScope } from "../shared/debt_scope.service";

export class InvalidPaymentAmountError extends Error {}

// Registra una reposición (total o parcial) a un trabajador y la reparte
// entre sus deudas PENDIENTES más antiguas primero (FIFO) — un trabajador
// espera que se le repongan antes las compras más viejas.
//
// La reposición es el egreso real de Caja: queda guardada con su monto,
// fecha y cuenta (employee_debt_payment), y cada parte aplicada a una deuda
// queda en employee_debt_payment_allocation. Así, dos abonos desde cuentas
// distintas son dos salidas distintas (antes el segundo pisaba la cuenta y
// la fecha del primero), y anular una reposición devuelve exactamente lo
// que cubrió.
//
// Todo en una transacción con las deudas bloqueadas (FOR UPDATE): dos
// reposiciones simultáneas al mismo trabajador se serializan, y la segunda
// ve lo que ya cubrió la primera — nunca se repone de más.
//
// Alcance de escritura: un usuario ligado a una tienda solo repone deudas de
// SU tienda (aunque pueda ver todas): el reparto FIFO y el tope "pendiente"
// se calculan solo sobre ellas.
const registerEmployeeDebtPayment = async ({
  userId,
  companyId,
  amount,
  paymentAccountId,
  operationNumber,
  scope,
  createdBy,
}: {
  userId: number;
  // Empresa del trabajador: la reposición y sus deudas son siempre de ella.
  companyId: number;
  // Monto a reponer ahora; debe ser > 0 y no superar el total pendiente.
  amount: number;
  paymentAccountId: number | null;
  operationNumber: string | null;
  scope: WriteScope;
  createdBy: number;
}) => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const lockedDebts = await DataBase.instance.employee_debt.findAll({
      where: { user_id: userId, company_id: companyId, status: "pending" },
      order: [
        ["created_at", "ASC"],
        ["id", "ASC"],
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const pendingDebts = await filterDebtsInWriteScope(lockedDebts, scope, transaction);
    const scopeNote = scope.businessUnitId === undefined ? "" : " en tu tienda";

    // Céntimos enteros: sin errores de redondeo al comparar ni al repartir.
    const amountCents = toCents(amount);
    const totalPendingCents = pendingDebts.reduce((sum, debt) => sum + toCents(debt.amount) - toCents(debt.paid_amount), 0);
    if (totalPendingCents <= 0) throw new InvalidPaymentAmountError(`Este trabajador no tiene deudas pendientes${scopeNote}`);
    if (amountCents <= 0 || amountCents > totalPendingCents) {
      throw new InvalidPaymentAmountError(
        `El monto a reponer no puede ser mayor al total pendiente${scopeNote} (${formatSoles(fromCents(totalPendingCents))})`
      );
    }

    const paidAt = todayInBusinessTz();
    await assertCashPeriodOpen({ companyId, date: paidAt, source: "employee_debt_payment", movesCash: true, transaction });
    const now = nowUtc();

    const payment = await DataBase.instance.employee_debt_payment.create(
      {
        id: 0,
        company_id: companyId,
        user_id: userId,
        amount: fromCents(amountCents),
        payment_account_id: paymentAccountId,
        operation_number: operationNumber,
        paid_at: paidAt,
        is_deleted: false,
        created_by: createdBy,
        created_at: now,
        updated_by: createdBy,
        updated_at: now,
      },
      { transaction }
    );

    let remainingCents = amountCents;
    for (const debt of pendingDebts) {
      if (remainingCents === 0) break;

      const debtAmountCents = toCents(debt.amount);
      const debtPaidCents = toCents(debt.paid_amount);
      const appliedCents = Math.min(debtAmountCents - debtPaidCents, remainingCents);
      if (appliedCents <= 0) continue;

      const newPaidCents = debtPaidCents + appliedCents;
      await debt.update(
        {
          paid_amount: fromCents(newPaidCents),
          status: newPaidCents === debtAmountCents ? "paid" : "pending",
          paid_at: paidAt,
          updated_by: createdBy,
          updated_at: now,
        },
        { transaction }
      );

      await DataBase.instance.employee_debt_payment_allocation.create(
        {
          id: 0,
          company_id: companyId,
          employee_debt_payment_id: payment.id,
          employee_debt_id: debt.id,
          amount: fromCents(appliedCents),
          created_by: createdBy,
          created_at: now,
          updated_by: createdBy,
          updated_at: now,
        },
        { transaction }
      );

      remainingCents -= appliedCents;
    }

    return {
      id: payment.id,
      amount: fromCents(amountCents),
      paid_at: paidAt,
      fully_paid: amountCents === totalPendingCents,
    };
  });
};

export { registerEmployeeDebtPayment };
