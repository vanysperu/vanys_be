import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { DataBase } from "../../../../database";
import { nowUtc, toDateOnlyString } from "../../../../utils/dateUtils";
import { createLogService } from "../../logs/services/create/log.services";
import { LogAction } from "../../logs/model/log.model";
import { LoanDto } from "../types/loan.types";
import { assertLoanDateOpen, assertLoanWritable, loadLoanDto, loadReadableLoan } from "./shared/loan_shared";

/**
 * Anula o restaura un préstamo (soft-delete, CLAUDE.md §1: active). Anulado,
 * su salida de dinero deja de contar en Caja. Solo sin cobros vigentes (si no,
 * los cobros quedarían colgados) y con el mes de caja del préstamo abierto.
 */
export async function toggleLoanService(loanId: number, user: IToken): Promise<LoanDto> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const loan = await loadReadableLoan(loanId, user, transaction, true);
    assertLoanWritable(loan, user);

    if (loan.active) {
      const payments = await DataBase.instance.loan_payment.count({ where: { loan_id: loanId, active: true }, transaction });
      if (payments > 0) {
        throw new AppError(409, "El préstamo tiene cobros: anula los cobros primero", undefined, "LOAN_HAS_PAYMENTS");
      }
    }
    await assertLoanDateOpen(Number(loan.company_id), toDateOnlyString(loan.loaned_at), transaction);

    const nextActive = !loan.active;
    await DataBase.instance.loan.update(
      { active: nextActive, updated_by: user.userId, updated_at: nowUtc() },
      { where: { id: loanId }, transaction }
    );
    await createLogService(
      {
        user_id: user.userId,
        action: nextActive ? LogAction.ACTIVE : LogAction.DISABLE,
        module: "loan",
        description: `${nextActive ? "Restauró" : "Anuló"} el préstamo #${loanId} a ${loan.borrower_name}`,
        company_id: Number(loan.company_id),
      },
      transaction
    );
    return (await loadLoanDto(loanId, transaction)) as LoanDto;
  });
}
