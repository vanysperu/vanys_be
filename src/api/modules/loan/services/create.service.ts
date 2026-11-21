import { AppError } from "../../../../core/errors/AppError";
import { DataBase } from "../../../../database";
import { nowUtc } from "../../../../utils/dateUtils";
import { roundMoney } from "../../../../utils/numbers";
import { createLogService } from "../../logs/services/create/log.services";
import { LogAction } from "../../logs/model/log.model";
import { CreateLoanInput, LoanDto } from "../types/loan.types";
import { assertLoanDateOpen, computeInterest, loadLoanDto } from "./shared/loan_shared";

/**
 * Registra un préstamo (21-nov). Sale de Caja el día del préstamo por la
 * cuenta elegida. Préstamo + log en una transacción: o quedan los dos, o nada.
 */
export async function createLoanService(input: CreateLoanInput): Promise<LoanDto> {
  if (input.dueDate && input.dueDate < input.loanedAt) {
    throw new AppError(400, "El vencimiento no puede ser antes de la fecha del préstamo", undefined, "LOAN_DUE_BEFORE_DATE");
  }
  const principal = roundMoney(input.principal);
  const interestRate = roundMoney(input.interestRate);
  const interestAmount = computeInterest(principal, interestRate);

  return DataBase.instance.sequelize.transaction(async (transaction) => {
    await assertLoanDateOpen(input.companyId, input.loanedAt, transaction);
    const now = nowUtc();
    const created = await DataBase.instance.loan.create(
      {
        id: 0,
        company_id: input.companyId,
        business_unit_id: input.businessUnitId,
        borrower_name: input.borrowerName,
        borrower_document: input.borrowerDocument,
        borrower_phone: input.borrowerPhone,
        principal,
        interest_rate: interestRate,
        interest_amount: interestAmount,
        total_due: roundMoney(principal + interestAmount),
        loaned_at: input.loanedAt,
        due_date: input.dueDate,
        payment_account_id: input.paymentAccountId,
        operation_number: input.operationNumber,
        notes: input.notes,
        active: true,
        created_by: input.actorId,
        created_at: now,
        updated_by: input.actorId,
        updated_at: now,
      },
      { transaction }
    );
    await createLogService(
      {
        user_id: input.actorId,
        action: LogAction.CREATE,
        module: "loan",
        description: `Registró el préstamo #${created.id} a ${input.borrowerName}: S/ ${principal.toFixed(2)} al ${interestRate}%`,
        company_id: input.companyId,
      },
      transaction
    );
    return (await loadLoanDto(Number(created.id), transaction)) as LoanDto;
  });
}
