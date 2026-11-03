import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";
import { EmployeeDebtOrigin, EmployeeDebtStatus } from "../../model/employee_debt.model";
import { correctionsCountSql } from "../../../money_correction/services/shared/corrections_count";

// Cada deuda de un trabajador, una por fila: de qué es (compra de una orden o
// gasto manual), cuánto, cuánto se le repuso y cuánto falta.
export interface EmployeeDebtDetailItem {
  id: number;
  origin: EmployeeDebtOrigin;
  description: string;
  category: string | null;
  incurred_at: string;
  amount: number;
  paid_amount: number;
  pending_amount: number;
  status: EmployeeDebtStatus;
  paid_at: string | null;
  quotation_id: number | null;
  purchase_order_id: number | null;
  registered_by_name: string | null;
  // Cuántas correcciones tiene (badge "Corregido (n)"), en la misma consulta.
  corrections_count: number;
}

export type EmployeeDebtDetailStatusFilter = EmployeeDebtStatus | "all";

export interface EmployeeDebtDetailFilter {
  // null = Super Administrador (todas las empresas).
  companyId: number | null;
  userId: number;
  status: EmployeeDebtDetailStatusFilter;
  page: number;
  limit: number;
}

interface RawDetailRow {
  id: number;
  origin: EmployeeDebtOrigin;
  description: string | null;
  category: string | null;
  incurred_at: string;
  amount: string;
  paid_amount: string;
  status: EmployeeDebtStatus;
  paid_at: string | null;
  quotation_id: number | null;
  purchase_order_id: number | null;
  registered_by_name: string | null;
  corrections_count: number | string | null;
}

const getEmployeeDebtDetail = async (
  filter: EmployeeDebtDetailFilter
): Promise<PaginatedResult<EmployeeDebtDetailItem>> => {
  const from = `
    FROM employee_debt ed
    LEFT JOIN purchase_order_item_purchase pop ON pop.id = ed.purchase_order_item_purchase_id
    LEFT JOIN quotation_expense qe ON qe.id = pop.quotation_expense_id
    LEFT JOIN purchase_order_item poi ON poi.id = pop.purchase_order_item_id
    LEFT JOIN purchase_order po ON po.id = poi.purchase_order_id
    LEFT JOIN user actor ON actor.id = ed.created_by
    WHERE ed.user_id = :userId
      AND (:companyId IS NULL OR ed.company_id = :companyId)
      AND (:status IS NULL OR ed.status = :status)`;
  const replacements = {
    userId: filter.userId,
    companyId: filter.companyId,
    status: filter.status === "all" ? null : filter.status,
  };

  const [countRow] = (await DataBase.instance.sequelize.query(`SELECT COUNT(*) AS total ${from}`, {
    type: QueryTypes.SELECT,
    replacements,
  })) as { total: number }[];

  const rows = (await DataBase.instance.sequelize.query(
    `SELECT ed.id, ed.origin, COALESCE(ed.description, qe.description) AS description, ed.category, ed.incurred_at,
            ed.amount, ed.paid_amount, ed.status, ed.paid_at, po.quotation_id, po.id AS purchase_order_id,
            CONCAT(actor.name, ' ', actor.paternal_lastname) AS registered_by_name,
            ${correctionsCountSql("employee_debt", "ed.id")} AS corrections_count
     ${from}
     ORDER BY ed.incurred_at DESC, ed.id DESC
     LIMIT :limit OFFSET :offset`,
    {
      type: QueryTypes.SELECT,
      replacements: { ...replacements, limit: filter.limit, offset: (filter.page - 1) * filter.limit },
    }
  )) as RawDetailRow[];

  const data = rows.map((row) => {
    const amount = Number(row.amount);
    const paidAmount = Number(row.paid_amount);
    return {
      id: row.id,
      origin: row.origin,
      description: row.description ?? "—",
      category: row.category,
      incurred_at: row.incurred_at,
      amount,
      paid_amount: paidAmount,
      pending_amount: row.status === "pending" ? Math.round((amount - paidAmount) * 100) / 100 : 0,
      status: row.status,
      paid_at: row.paid_at,
      quotation_id: row.quotation_id,
      purchase_order_id: row.purchase_order_id,
      registered_by_name: row.registered_by_name,
      corrections_count: Number(row.corrections_count ?? 0),
    };
  });

  return { data, meta: buildPaginationMeta(Number(countRow?.total ?? 0), filter.page, filter.limit) };
};

export { getEmployeeDebtDetail };
