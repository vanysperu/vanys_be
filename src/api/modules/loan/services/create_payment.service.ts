import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { DataBase } from "../../../../database";
import { nowUtc, toDateOnlyString } from "../../../../utils/dateUtils";
import { roundMoney } from "../../../../utils/numbers";
import { createLogService } from "../../logs/services/create/log.services";
import { LogAction } from "../../logs/model/log.model";
import { resolvePaymentAccountId } from "../../variable_general/services/shared/payment_account.service";
import { CreateLoanPaymentInput, LoanDto } from "../types/loan.types";
import { assertLoanDateOpen, assertLoanWritable, loadLoanDto, loadReadableLoan, splitPayment } from "./shared/loan_shared";

/**
 * Registra un cobro de un préstamo (21-nov). Entra a Caja por la cuenta
 * elegida; se reparte en capital (vuelve a la caja) e interés (ingreso). Nunca
 * más que el saldo. Con la fila del préstamo bloqueada: dos cobros a la vez no
 * pueden pasarse del saldo.
 */
export async function createLoanPaymentService(loanId: number, input: CreateLoanPaymentInput, user: IToken): Promise<LoanDto> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const loan = await loadReadableLoan(loanId, user, transaction, true);
    assertLoanWritable(loan, user);
    if (!loan.active) throw new AppError(409, "El préstamo está anulado", undefined, "LOAN_ANNULLED");
    if (input.paidAt < toDateOnlyString(loan.loaned_at)) {
      throw new AppError(400, "El cobro no puede ser antes de la fecha del préstamo", undefined, "LOAN_PAYMENT_BEFORE_LOAN");
    }

    const payments = await DataBase.instance.loan_payment.findAll({
      where: { loan_id: loanId, active: true },
      attributes: ["amount", "interest_part"],
      transaction,
    });
    const paidSoFar = roundMoney(payments.reduce((sum, row) => sum + Number(row.amount), 0));
    const interestSoFar = roundMoney(payments.reduce((sum, row) => sum + Number(row.interest_part), 0));
    const totalDue = Number(loan.total_due);
    const balance = roundMoney(totalDue - paidSoFar);
    const amount = roundMoney(input.amount);
    if (amount > balance) {
      throw new AppError(
        400,
        `El cobro (S/ ${amount.toFixed(2)}) es mayor que el saldo del préstamo (S/ ${balance.toFixed(2)})`,
        undefined,
        "LOAN_PAYMENT_EXCEEDS_BALANCE"
      );
    }
    await assertLoanDateOpen(Number(loan.company_id), input.paidAt, transaction);

    // La cuenta tiene que ser de la empresa del préstamo y estar activa; null = efectivo.
    const paymentAccountId = await resolvePaymentAccountId({
      accountId: input.paymentAccountId,
      companyId: Number(loan.company_id),
      required: false,
      transaction,
    });
    const split = splitPayment({ amount, totalDue, interestAmount: Number(loan.interest_amount), paidSoFar, interestSoFar });
    const now = nowUtc();
    await DataBase.instance.loan_payment.create(
      {
        id: 0,
        loan_id: loanId,
        company_id: Number(loan.company_id),
        business_unit_id: loan.business_unit_id ?? null,
        amount,
        principal_part: split.principal_part,
        interest_part: split.interest_part,
        paid_at: input.paidAt,
        payment_account_id: paymentAccountId,
        operation_number: input.operationNumber,
        notes: input.notes,
        active: true,
        created_by: user.userId,
        created_at: now,
        updated_by: user.userId,
        updated_at: now,
      },
      { transaction }
    );
    await createLogService(
      {
        user_id: user.userId,
        action: LogAction.CREATE,
        module: "loan",
        description: `Cobró S/ ${amount.toFixed(2)} del préstamo #${loanId} (interés S/ ${split.interest_part.toFixed(2)})`,
        company_id: Number(loan.company_id),
      },
      transaction
    );
    return (await loadLoanDto(loanId, transaction)) as LoanDto;
  });
}
