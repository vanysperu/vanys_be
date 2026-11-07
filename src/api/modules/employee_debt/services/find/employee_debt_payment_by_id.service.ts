import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { isOutOfWriteScope, WriteScope } from "../../../../../core/rbac/writeScope";
import { fromCents, toCents } from "../../../../../core/utils/money";
import { toDateOnlyString } from "../../../../../utils/dateUtils";
import { correctionsCountSql } from "../../../money_correction/services/shared/corrections_count";
import { EmployeeDebtOrigin, EmployeeDebtStatus } from "../../model/employee_debt.model";
import { DEBT_BUSINESS_UNIT_SQL, DEBT_QUOTATION_JOINS_SQL } from "../shared/debt_scope.service";

// Una deuda del trabajador vista desde una reposición: cuánto le cubre esta
// reposición y cuánto más se le podría cubrir. Con esto el diálogo
// "Corregir reposición" muestra, antes de guardar, cómo quedaría el reparto
// (misma regla que el backend: reimbursement_allocation.ts).
export interface ReimbursementDebtLine {
  employee_debt_id: number;
  origin: EmployeeDebtOrigin;
  description: string;
  incurred_at: string;
  debt_amount: number;
  // Lo repuesto vigente de la deuda (todas las reposiciones).
  debt_paid_amount: number;
  debt_status: EmployeeDebtStatus;
  // Lo que ESTA reposición le cubre (0 si no la cubre).
  allocated_amount: number;
  // Lo que todavía se le puede cubrir (monto − repuesto vigente).
  room_amount: number;
}

export interface EmployeeDebtPaymentRecord {
  id: number;
  company_id: number;
  user_id: number;
  employee_name: string | null;
  amount: number;
  paid_at: string;
  payment_account_id: number | null;
  payment_account_name: string | null;
  operation_number: string | null;
  is_deleted: boolean;
  corrections_count: number;
  // Deudas que cubre, de la más antigua a la más nueva (al bajar el monto
  // se achican desde la última).
  allocations: ReimbursementDebtLine[];
  // Otras deudas pendientes del trabajador (dentro del alcance del usuario),
  // FIFO: al subir el monto se completan después de las ya cubiertas.
  pending_debts: ReimbursementDebtLine[];
}

interface RawPaymentRow {
  id: number;
  company_id: number;
  user_id: number;
  employee_name: string | null;
  amount: string;
  paid_at: string | Date;
  payment_account_id: number | null;
  payment_account_name: string | null;
  operation_number: string | null;
  is_deleted: number | boolean;
  corrections_count: number | string;
}

interface RawLineRow {
  id: number;
  origin: EmployeeDebtOrigin;
  description: string | null;
  incurred_at: string | Date;
  amount: string;
  paid_amount: string;
  status: EmployeeDebtStatus;
  allocated_amount: string | null;
  business_unit_id: number | null;
  company_id: number;
}

const NOT_FOUND_MESSAGE = "La reposición no existe";

const toLine = (row: RawLineRow): ReimbursementDebtLine => {
  const amountCents = toCents(row.amount);
  const paidCents = toCents(row.paid_amount);
  return {
    employee_debt_id: Number(row.id),
    origin: row.origin,
    description: row.description ?? "—",
    incurred_at: toDateOnlyString(row.incurred_at),
    debt_amount: fromCents(amountCents),
    debt_paid_amount: fromCents(paidCents),
    debt_status: row.status,
    allocated_amount: fromCents(toCents(row.allocated_amount ?? 0)),
    room_amount: row.status === "cancelled" ? 0 : fromCents(Math.max(amountCents - paidCents, 0)),
  };
};

/**
 * GET /employee-debt/payment/find/:id. Mismo alcance que corregirla: fuera
 * de la empresa, o (usuario ligado a una tienda) con alguna deuda cubierta
 * de otra tienda → 404.
 */
const findEmployeeDebtPaymentById = async ({
  paymentId,
  scope,
}: {
  paymentId: number;
  scope: WriteScope;
}): Promise<EmployeeDebtPaymentRecord> => {
  const [payment] = await DataBase.instance.sequelize.query<RawPaymentRow>(
    `SELECT p.id, p.company_id, p.user_id, CONCAT(u.name, ' ', u.paternal_lastname) AS employee_name, p.amount,
            p.paid_at, p.payment_account_id, pa.name AS payment_account_name, p.operation_number, p.is_deleted,
            ${correctionsCountSql("employee_debt_payment", "p.id")} AS corrections_count
     FROM employee_debt_payment p
     INNER JOIN user u ON u.id = p.user_id
     LEFT JOIN general_variable pa ON pa.id = p.payment_account_id
     WHERE p.id = :paymentId`,
    { type: QueryTypes.SELECT, replacements: { paymentId } }
  );
  if (!payment) throw new AppError(404, NOT_FOUND_MESSAGE);
  if (scope.companyId !== null && Number(payment.company_id) !== scope.companyId) throw new AppError(404, NOT_FOUND_MESSAGE);

  // Deudas del trabajador que esta reposición cubre o que siguen pendientes,
  // en orden de antigüedad (el mismo del reparto FIFO).
  const rows = await DataBase.instance.sequelize.query<RawLineRow>(
    `SELECT ed.id, ed.origin, COALESCE(ed.description, dqe.description) AS description, ed.incurred_at, ed.amount,
            ed.paid_amount, ed.status, a.amount AS allocated_amount, ed.company_id,
            ${DEBT_BUSINESS_UNIT_SQL} AS business_unit_id
     FROM employee_debt ed
     ${DEBT_QUOTATION_JOINS_SQL}
     LEFT JOIN employee_debt_payment_allocation a ON a.employee_debt_id = ed.id AND a.employee_debt_payment_id = :paymentId
     WHERE ed.user_id = :userId AND ed.company_id = :companyId
       AND (a.id IS NOT NULL OR ed.status = 'pending')
     ORDER BY ed.created_at ASC, ed.id ASC`,
    { type: QueryTypes.SELECT, replacements: { paymentId, userId: payment.user_id, companyId: payment.company_id } }
  );

  const inScope = (row: RawLineRow) =>
    !isOutOfWriteScope({ company_id: Number(row.company_id), business_unit_id: row.business_unit_id }, scope);
  const covered = rows.filter((row) => row.allocated_amount !== null);
  if (!covered.every(inScope)) throw new AppError(404, NOT_FOUND_MESSAGE);

  return {
    id: Number(payment.id),
    company_id: Number(payment.company_id),
    user_id: Number(payment.user_id),
    employee_name: payment.employee_name,
    amount: fromCents(toCents(payment.amount)),
    paid_at: toDateOnlyString(payment.paid_at),
    payment_account_id: payment.payment_account_id === null ? null : Number(payment.payment_account_id),
    payment_account_name: payment.payment_account_name,
    operation_number: payment.operation_number,
    is_deleted: Boolean(payment.is_deleted),
    corrections_count: Number(payment.corrections_count),
    allocations: covered.map(toLine),
    pending_debts: rows.filter((row) => row.allocated_amount === null && inScope(row)).map(toLine),
  };
};

export { findEmployeeDebtPaymentById };
