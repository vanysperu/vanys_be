import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { DataBase } from "../../../../database";
import { nowUtc, toDateOnlyString } from "../../../../utils/dateUtils";
import { roundMoney } from "../../../../utils/numbers";
import { createLogService } from "../../logs/services/create/log.services";
import { LogAction } from "../../logs/model/log.model";
import { resolvePaymentAccountId } from "../../variable_general/services/shared/payment_account.service";
import { LoanDto, UpdateLoanInput } from "../types/loan.types";
import { assertLoanDateOpen, assertLoanWritable, computeInterest, loadLoanDto, loadReadableLoan } from "./shared/loan_shared";

// Campos de dinero: cambian lo que salió de Caja o lo que se debe cobrar.
const MONEY_FIELDS: (keyof UpdateLoanInput)[] = ["principal", "interestRate", "loanedAt", "paymentAccountId", "operationNumber"];

/**
 * Corrige un préstamo (21-nov). Los datos de la persona, el vencimiento y las
 * notas se cambian siempre; el dinero (capital, %, fecha, cuenta) solo si
 * todavía no tiene cobros (con cobros, el reparto capital/interés ya hecho
 * quedaría descuadrado) y con el mes de caja abierto (el de antes y el nuevo).
 */
export async function updateLoanService(loanId: number, input: UpdateLoanInput, user: IToken): Promise<LoanDto> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const loan = await loadReadableLoan(loanId, user, transaction, true);
    assertLoanWritable(loan, user);
    if (!loan.active) throw new AppError(409, "El préstamo está anulado", undefined, "LOAN_ANNULLED");

    const touchesMoney = MONEY_FIELDS.some((field) => input[field] !== undefined);
    if (touchesMoney) {
      const payments = await DataBase.instance.loan_payment.count({ where: { loan_id: loanId, active: true }, transaction });
      if (payments > 0) {
        throw new AppError(
          409,
          "El préstamo ya tiene cobros: el monto, el interés, la fecha y la cuenta ya no se pueden cambiar. Anula los cobros primero.",
          undefined,
          "LOAN_HAS_PAYMENTS"
        );
      }
      await assertLoanDateOpen(Number(loan.company_id), toDateOnlyString(loan.loaned_at), transaction);
      if (input.loanedAt) await assertLoanDateOpen(Number(loan.company_id), input.loanedAt, transaction);
    }

    // La cuenta tiene que ser de la empresa del préstamo y estar activa; null = efectivo.
    const paymentAccountId =
      input.paymentAccountId !== undefined
        ? await resolvePaymentAccountId({ accountId: input.paymentAccountId, companyId: Number(loan.company_id), required: false, transaction })
        : loan.payment_account_id;
    const principal = roundMoney(input.principal ?? Number(loan.principal));
    const interestRate = roundMoney(input.interestRate ?? Number(loan.interest_rate));
    const interestAmount = computeInterest(principal, interestRate);
    const loanedAt = input.loanedAt ?? toDateOnlyString(loan.loaned_at);
    const dueDate = input.dueDate !== undefined ? input.dueDate : loan.due_date;
    if (dueDate && dueDate < loanedAt) {
      throw new AppError(400, "El vencimiento no puede ser antes de la fecha del préstamo", undefined, "LOAN_DUE_BEFORE_DATE");
    }

    await DataBase.instance.loan.update(
      {
        borrower_name: input.borrowerName ?? loan.borrower_name,
        borrower_document: input.borrowerDocument !== undefined ? input.borrowerDocument : loan.borrower_document,
        borrower_phone: input.borrowerPhone !== undefined ? input.borrowerPhone : loan.borrower_phone,
        notes: input.notes !== undefined ? input.notes : loan.notes,
        due_date: dueDate,
        principal,
        interest_rate: interestRate,
        interest_amount: interestAmount,
        total_due: roundMoney(principal + interestAmount),
        loaned_at: loanedAt,
        payment_account_id: paymentAccountId,
        operation_number: input.operationNumber !== undefined ? input.operationNumber : loan.operation_number,
        updated_by: user.userId,
        updated_at: nowUtc(),
      },
      { where: { id: loanId }, transaction }
    );
    await createLogService(
      {
        user_id: user.userId,
        action: LogAction.UPDATE,
        module: "loan",
        description: `Corrigió el préstamo #${loanId}${touchesMoney ? ` (S/ ${principal.toFixed(2)} al ${interestRate}%)` : ""}`,
        company_id: Number(loan.company_id),
      },
      transaction
    );
    return (await loadLoanDto(loanId, transaction)) as LoanDto;
  });
}
