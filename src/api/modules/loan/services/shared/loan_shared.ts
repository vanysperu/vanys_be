import { QueryTypes, Transaction } from "sequelize";
import { IToken } from "../../../../interfaces/IToken.interface";
import { AppError } from "../../../../../core/errors/AppError";
import { CASH_CLOSING_ERROR_CODES } from "../../../../../core/money/cashPeriod";
import { acquireLedgerShareLock, findPeriodShareLocked } from "../../../cash_closing/services/shared/period_state.service";
import { resolveBusinessUnitFilter } from "../../../../../core/rbac/businessUnitScope";
import { isOutOfWriteScope, resolveWriteScope } from "../../../../../core/rbac/writeScope";
import { DataBase } from "../../../../../database";
import {
  capitalizeEs,
  formatPeriodEs,
  periodOf,
  todayInBusinessTz,
  toDateOnlyString,
  utcToBusinessParts,
} from "../../../../../utils/dateUtils";
import { roundMoney } from "../../../../../utils/numbers";
import { LoanModel } from "../../model/loan.model";
import { LoanDto, LoanPaymentDto, LoanStatus } from "../../types/loan.types";

// Interés simple, una sola vez sobre el capital (decisión del usuario):
// 1000 al 10% -> 100 de interés, se cobran 1100 en total.
export const computeInterest = (principal: number, ratePercent: number): number => roundMoney((principal * ratePercent) / 100);

/**
 * Reparte un cobro en capital e interés EN PROPORCIÓN al total del préstamo
 * (cada sol cobrado lleva la misma parte de interés). El cobro que deja el
 * saldo en cero se lleva lo que falte de interés: así la suma de los intereses
 * cobrados es exactamente el interés del préstamo, sin céntimos sueltos.
 */
export const splitPayment = ({
  amount,
  totalDue,
  interestAmount,
  paidSoFar,
  interestSoFar,
}: {
  amount: number;
  totalDue: number;
  interestAmount: number;
  paidSoFar: number;
  interestSoFar: number;
}): { principal_part: number; interest_part: number } => {
  const remainingInterest = roundMoney(interestAmount - interestSoFar);
  const closesLoan = roundMoney(totalDue - paidSoFar - amount) === 0;
  const proportional = totalDue > 0 ? roundMoney((amount * interestAmount) / totalDue) : 0;
  const interest = closesLoan ? remainingInterest : Math.min(Math.max(proportional, 0), remainingInterest, amount);
  return { interest_part: roundMoney(interest), principal_part: roundMoney(amount - interest) };
};

export const loanStatusOf = (loan: { active: boolean; balance: number; due_date: string | null }): LoanStatus => {
  if (!loan.active) return "annulled";
  if (loan.balance <= 0) return "paid";
  if (loan.due_date && loan.due_date < todayInBusinessTz()) return "overdue";
  return "pending";
};

// Fila cruda del listado/detalle (préstamo + sumas de sus cobros vigentes).
export interface LoanRow {
  id: number;
  company_id: number;
  business_unit_id: number | null;
  borrower_name: string;
  borrower_document: string | null;
  borrower_phone: string | null;
  principal: unknown;
  interest_rate: unknown;
  interest_amount: unknown;
  total_due: unknown;
  paid_amount: unknown;
  paid_interest: unknown;
  payments_count: unknown;
  loaned_at: string | Date;
  due_date: string | Date | null;
  payment_account_id: number | null;
  payment_account_name: string | null;
  operation_number: string | null;
  notes: string | null;
  active: unknown;
  created_at: Date;
  created_by_name: string | null;
}

// SELECT común: préstamo, su cuenta, quién lo registró y las sumas de sus
// cobros vigentes en UNA consulta (nunca una por préstamo).
export const LOAN_SELECT_SQL = `
  SELECT l.id, l.company_id, l.business_unit_id, l.borrower_name, l.borrower_document, l.borrower_phone,
         l.principal, l.interest_rate, l.interest_amount, l.total_due,
         COALESCE(p.paid_amount, 0) AS paid_amount, COALESCE(p.paid_interest, 0) AS paid_interest,
         COALESCE(p.payments_count, 0) AS payments_count,
         DATE_FORMAT(l.loaned_at, '%Y-%m-%d') AS loaned_at, DATE_FORMAT(l.due_date, '%Y-%m-%d') AS due_date,
         l.payment_account_id, pa.name AS payment_account_name, l.operation_number, l.notes, l.active, l.created_at,
         TRIM(CONCAT(COALESCE(u.name, ''), ' ', COALESCE(u.paternal_lastname, ''))) AS created_by_name
  FROM loan l
  LEFT JOIN (
    SELECT loan_id, SUM(amount) AS paid_amount, SUM(interest_part) AS paid_interest, COUNT(*) AS payments_count
    FROM loan_payment WHERE active = 1 GROUP BY loan_id
  ) p ON p.loan_id = l.id
  LEFT JOIN general_variable pa ON pa.id = l.payment_account_id
  LEFT JOIN \`user\` u ON u.id = l.created_by`;

export const toLoanDto = (row: LoanRow): LoanDto => {
  const totalDue = Number(row.total_due);
  const paid = roundMoney(Number(row.paid_amount));
  const active = Number(row.active) === 1 || row.active === true;
  const dueDate = row.due_date ? toDateOnlyString(row.due_date) : null;
  const balance = roundMoney(totalDue - paid);
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    business_unit_id: row.business_unit_id === null ? null : Number(row.business_unit_id),
    borrower_name: row.borrower_name,
    borrower_document: row.borrower_document,
    borrower_phone: row.borrower_phone,
    principal: Number(row.principal),
    interest_rate: Number(row.interest_rate),
    interest_amount: Number(row.interest_amount),
    total_due: totalDue,
    paid_amount: paid,
    paid_interest: roundMoney(Number(row.paid_interest)),
    payments_count: Number(row.payments_count),
    balance,
    status: loanStatusOf({ active, balance, due_date: dueDate }),
    loaned_at: toDateOnlyString(row.loaned_at),
    due_date: dueDate,
    payment_account_id: row.payment_account_id === null ? null : Number(row.payment_account_id),
    payment_account_name: row.payment_account_name,
    operation_number: row.operation_number,
    notes: row.notes,
    active,
    createdAt: utcToBusinessParts(row.created_at),
    created_by_name: row.created_by_name || null,
  };
};

export interface LoanPaymentRow {
  id: number;
  loan_id: number;
  amount: unknown;
  principal_part: unknown;
  interest_part: unknown;
  paid_at: string | Date;
  payment_account_id: number | null;
  payment_account_name: string | null;
  operation_number: string | null;
  notes: string | null;
  active: unknown;
  created_at: Date;
  created_by_name: string | null;
}

export const toLoanPaymentDto = (row: LoanPaymentRow): LoanPaymentDto => ({
  id: Number(row.id),
  loan_id: Number(row.loan_id),
  amount: Number(row.amount),
  principal_part: Number(row.principal_part),
  interest_part: Number(row.interest_part),
  paid_at: toDateOnlyString(row.paid_at),
  payment_account_id: row.payment_account_id === null ? null : Number(row.payment_account_id),
  payment_account_name: row.payment_account_name,
  operation_number: row.operation_number,
  notes: row.notes,
  active: Number(row.active) === 1 || row.active === true,
  createdAt: utcToBusinessParts(row.created_at),
  created_by_name: row.created_by_name || null,
});

// Un préstamo armado como DTO (con las sumas de sus cobros), o null.
export const loadLoanDto = async (loanId: number, transaction?: Transaction): Promise<LoanDto | null> => {
  const rows = (await DataBase.instance.sequelize.query(`${LOAN_SELECT_SQL} WHERE l.id = :loanId`, {
    type: QueryTypes.SELECT,
    replacements: { loanId },
    transaction,
  })) as LoanRow[];
  return rows[0] ? toLoanDto(rows[0]) : null;
};

/**
 * Préstamo legible por el usuario: de su empresa (o cualquiera si es Super
 * Administrador) y, si está limitado a una tienda, de esa tienda. Si no, 404
 * (nunca se revela que existe en otra empresa).
 */
export const loadReadableLoan = async (loanId: number, user: IToken, transaction?: Transaction, lock = false): Promise<LoanModel> => {
  const loan = await DataBase.instance.loan.findByPk(loanId, {
    transaction,
    ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!loan) throw new AppError(404, "El préstamo no existe", undefined, "NOT_FOUND");
  if (!user.isSystem && Number(loan.company_id) !== user.companyId) throw new AppError(404, "El préstamo no existe", undefined, "NOT_FOUND");
  const scopedBusinessUnitId = resolveBusinessUnitFilter(user);
  if (scopedBusinessUnitId !== undefined && Number(loan.business_unit_id) !== scopedBusinessUnitId) {
    throw new AppError(404, "El préstamo no existe", undefined, "NOT_FOUND");
  }
  return loan;
};

// Además de verlo, poder escribir en él (un usuario con tienda, solo en la suya).
export const assertLoanWritable = (loan: LoanModel, user: IToken): void => {
  const ownership = { company_id: Number(loan.company_id), business_unit_id: loan.business_unit_id ?? null };
  if (!isOutOfWriteScope(ownership, resolveWriteScope(user))) return;
  throw new AppError(403, "Solo puedes cambiar préstamos de tu tienda", undefined, "STORE_WRITE_SCOPE");
};

/**
 * El dinero de un préstamo o un cobro no puede entrar ni cambiar en un mes de
 * caja ya cerrado. Mismo protocolo que las transferencias (no tienen historial
 * de correcciones): se llama DESPUÉS de bloquear la fila propia; sin libro de
 * caja, o antes del mes de inicio, no restringe nada.
 */
export async function assertLoanDateOpen(companyId: number, date: string, transaction: Transaction): Promise<void> {
  const ledger = await acquireLedgerShareLock(companyId, transaction);
  if (!ledger) return;
  if (date < ledger.startDate) return;

  const period = periodOf(date);
  const state = await findPeriodShareLocked(companyId, period, transaction);
  if (state?.status !== "closed") return;

  throw new AppError(
    409,
    `${capitalizeEs(formatPeriodEs(period))} ya está cerrado: un préstamo o cobro de ese mes no se puede registrar, ` +
      "cambiar ni anular. Pide a un administrador que reabra el mes.",
    { period },
    CASH_CLOSING_ERROR_CODES.periodClosed
  );
}
