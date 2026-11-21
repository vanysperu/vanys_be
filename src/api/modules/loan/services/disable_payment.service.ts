import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { DataBase } from "../../../../database";
import { nowUtc, toDateOnlyString } from "../../../../utils/dateUtils";
import { createLogService } from "../../logs/services/create/log.services";
import { LogAction } from "../../logs/model/log.model";
import { LoanDto } from "../types/loan.types";
import { assertLoanDateOpen, assertLoanWritable, loadLoanDto, loadReadableLoan } from "./shared/loan_shared";

/**
 * Anula un cobro mal registrado (soft, active = false; de una sola vía: si
 * hacía falta, se vuelve a registrar). Deja de contar en Caja y el saldo del
 * préstamo vuelve a subir. Solo con el mes de caja del cobro abierto.
 */
export async function disableLoanPaymentService(paymentId: number, user: IToken): Promise<LoanDto> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const payment = await DataBase.instance.loan_payment.findByPk(paymentId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!payment) throw new AppError(404, "El cobro no existe", undefined, "NOT_FOUND");
    const loan = await loadReadableLoan(Number(payment.loan_id), user, transaction, true);
    assertLoanWritable(loan, user);
    if (!payment.active) throw new AppError(409, "El cobro ya está anulado", undefined, "LOAN_PAYMENT_ANNULLED");
    await assertLoanDateOpen(Number(loan.company_id), toDateOnlyString(payment.paid_at), transaction);

    await DataBase.instance.loan_payment.update(
      { active: false, updated_by: user.userId, updated_at: nowUtc() },
      { where: { id: paymentId }, transaction }
    );
    await createLogService(
      {
        user_id: user.userId,
        action: LogAction.DISABLE,
        module: "loan",
        description: `Anuló el cobro #${paymentId} (S/ ${Number(payment.amount).toFixed(2)}) del préstamo #${loan.id}`,
        company_id: Number(loan.company_id),
      },
      transaction
    );
    return (await loadLoanDto(Number(loan.id), transaction)) as LoanDto;
  });
}
