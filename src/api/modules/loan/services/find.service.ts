import { QueryTypes } from "sequelize";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { DataBase } from "../../../../database";
import { LoanDetailDto } from "../types/loan.types";
import { loadLoanDto, loadReadableLoan, LoanPaymentRow, toLoanPaymentDto } from "./shared/loan_shared";

// Un préstamo con todos sus cobros (también los anulados, para el historial),
// del más reciente al más viejo.
export async function findLoanService(loanId: number, user: IToken): Promise<LoanDetailDto> {
  await loadReadableLoan(loanId, user);
  const [loan, payments] = await Promise.all([
    loadLoanDto(loanId),
    DataBase.instance.sequelize.query(
      `SELECT lp.id, lp.loan_id, lp.amount, lp.principal_part, lp.interest_part,
              DATE_FORMAT(lp.paid_at, '%Y-%m-%d') AS paid_at, lp.payment_account_id, pa.name AS payment_account_name,
              lp.operation_number, lp.notes, lp.active, lp.created_at,
              TRIM(CONCAT(COALESCE(u.name, ''), ' ', COALESCE(u.paternal_lastname, ''))) AS created_by_name
       FROM loan_payment lp
       LEFT JOIN general_variable pa ON pa.id = lp.payment_account_id
       LEFT JOIN \`user\` u ON u.id = lp.created_by
       WHERE lp.loan_id = :loanId
       ORDER BY lp.paid_at DESC, lp.id DESC`,
      { type: QueryTypes.SELECT, replacements: { loanId } }
    ) as Promise<LoanPaymentRow[]>,
  ]);
  if (!loan) throw new AppError(404, "El préstamo no existe", undefined, "NOT_FOUND");
  return { ...loan, payments: payments.map(toLoanPaymentDto) };
}
