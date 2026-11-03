import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { isOutOfWriteScope, WriteScope } from "../../../../../core/rbac/writeScope";
import { fromCents, toCents } from "../../../../../core/utils/money";
import { toDateOnlyString } from "../../../../../utils/dateUtils";
import { correctionsCountSql } from "../../../money_correction/services/shared/corrections_count";
import { EmployeeDebtOrigin, EmployeeDebtStatus } from "../../model/employee_debt.model";
import { DEBT_BUSINESS_UNIT_SQL, DEBT_QUOTATION_JOINS_SQL } from "../shared/debt_scope.service";

// Una deuda tal como la necesita el diálogo "Corregir deuda": sus valores
// actuales, con los nombres de trabajador y tienda.
export interface EmployeeDebtRecord {
  id: number;
  company_id: number;
  user_id: number;
  user_name: string | null;
  origin: EmployeeDebtOrigin;
  description: string | null;
  category: string | null;
  // Tienda propia de la deuda (solo manuales; las de compras = null).
  business_unit_id: number | null;
  business_unit_name: string | null;
  incurred_at: string;
  amount: number;
  paid_amount: number;
  pending_amount: number;
  status: EmployeeDebtStatus;
  paid_at: string | null;
  quotation_id: number | null;
  purchase_order_id: number | null;
  corrections_count: number;
}

interface RawDebtRow {
  id: number;
  company_id: number;
  user_id: number;
  user_name: string | null;
  origin: EmployeeDebtOrigin;
  description: string | null;
  category: string | null;
  business_unit_id: number | null;
  business_unit_name: string | null;
  effective_business_unit_id: number | null;
  incurred_at: string | Date;
  amount: string;
  paid_amount: string;
  status: EmployeeDebtStatus;
  paid_at: string | Date | null;
  quotation_id: number | null;
  purchase_order_id: number | null;
  corrections_count: number | string;
}

/**
 * GET /employee-debt/find/:id. Mismo alcance que corregirla (es la pantalla
 * de corrección): fuera de la empresa o de la tienda del usuario → 404.
 */
const findEmployeeDebtById = async ({ debtId, scope }: { debtId: number; scope: WriteScope }): Promise<EmployeeDebtRecord> => {
  const [row] = await DataBase.instance.sequelize.query<RawDebtRow>(
    `SELECT ed.id, ed.company_id, ed.user_id, CONCAT(u.name, ' ', u.paternal_lastname) AS user_name, ed.origin,
            COALESCE(ed.description, dqe.description) AS description, ed.category, ed.business_unit_id,
            bu.business_code AS business_unit_name, ${DEBT_BUSINESS_UNIT_SQL} AS effective_business_unit_id,
            ed.incurred_at, ed.amount, ed.paid_amount, ed.status, ed.paid_at, dpo.quotation_id,
            dpo.id AS purchase_order_id, ${correctionsCountSql("employee_debt", "ed.id")} AS corrections_count
     FROM employee_debt ed
     INNER JOIN user u ON u.id = ed.user_id
     ${DEBT_QUOTATION_JOINS_SQL}
     LEFT JOIN quotation_expense dqe ON dqe.id = dpop.quotation_expense_id
     LEFT JOIN business_unit bu ON bu.id = ed.business_unit_id
     WHERE ed.id = :debtId`,
    { type: QueryTypes.SELECT, replacements: { debtId } }
  );
  if (!row) throw new AppError(404, "La deuda no existe");
  if (isOutOfWriteScope({ company_id: row.company_id, business_unit_id: row.effective_business_unit_id }, scope)) {
    throw new AppError(404, "La deuda no existe");
  }

  const amountCents = toCents(row.amount);
  const paidCents = toCents(row.paid_amount);
  return {
    id: Number(row.id),
    company_id: Number(row.company_id),
    user_id: Number(row.user_id),
    user_name: row.user_name,
    origin: row.origin,
    description: row.description,
    category: row.category,
    business_unit_id: row.business_unit_id === null ? null : Number(row.business_unit_id),
    business_unit_name: row.business_unit_name,
    incurred_at: toDateOnlyString(row.incurred_at),
    amount: fromCents(amountCents),
    paid_amount: fromCents(paidCents),
    pending_amount: row.status === "pending" ? fromCents(amountCents - paidCents) : 0,
    status: row.status,
    paid_at: row.paid_at === null ? null : toDateOnlyString(row.paid_at),
    quotation_id: row.quotation_id,
    purchase_order_id: row.purchase_order_id,
    corrections_count: Number(row.corrections_count),
  };
};

export { findEmployeeDebtById };
