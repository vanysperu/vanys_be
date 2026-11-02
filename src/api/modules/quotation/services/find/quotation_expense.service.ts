import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { correctionsCountSql } from "../../../money_correction/services/shared/corrections_count";
import { QuotationStatus } from "../../model/quotation.model";

// Un gasto de cotización tal como lo necesita el diálogo de corrección (y el
// service de corrección para el alcance): con la empresa/tienda de su
// cotización, el nombre de su cuenta, si es la compra de una orden
// (purchase_id) y cuántas correcciones tiene.
export interface QuotationExpenseDetail {
  id: number;
  quotation_id: number;
  description: string;
  amount: number;
  category: string | null;
  spent_at: string;
  payment_account_id: number | null;
  payment_account_name: string | null;
  is_deleted: boolean;
  // Compra de orden de compra a la que pertenece (null = gasto manual).
  purchase_id: number | null;
  company_id: number;
  business_unit_id: number | null;
  quotation_status: QuotationStatus;
  corrections_count: number;
}

interface RawExpenseRow {
  id: number | string;
  quotation_id: number | string;
  description: string;
  amount: number | string;
  category: string | null;
  spent_at: string;
  payment_account_id: number | string | null;
  payment_account_name: string | null;
  is_deleted: number | boolean;
  purchase_id: number | string | null;
  company_id: number | string;
  business_unit_id: number | string | null;
  quotation_status: QuotationStatus;
  corrections_count: number | string;
}

const toNullableNumber = (value: number | string | null): number | null => (value === null ? null : Number(value));

// SQL fijo; el id va bindeado. spent_at como texto YYYY-MM-DD (DATEONLY sin
// conversión de zona).
const EXPENSE_DETAIL_SQL = `
  SELECT qe.id, qe.quotation_id, qe.description, qe.amount, qe.category,
         DATE_FORMAT(qe.spent_at, '%Y-%m-%d') AS spent_at,
         qe.payment_account_id, pa.name AS payment_account_name, qe.is_deleted,
         fpop.id AS purchase_id, q.company_id, q.business_unit_id, q.status AS quotation_status,
         ${correctionsCountSql("quotation_expense", "qe.id")} AS corrections_count
  FROM quotation_expense qe
  INNER JOIN quotation q ON q.id = qe.quotation_id
  LEFT JOIN purchase_order_item_purchase fpop ON fpop.quotation_expense_id = qe.id
  LEFT JOIN general_variable pa ON pa.id = qe.payment_account_id
  WHERE qe.id = :id`;

/** Gasto por id, o null si no existe. No aplica alcance: lo decide el caller. */
export async function findQuotationExpenseById(
  id: number,
  transaction?: Transaction
): Promise<QuotationExpenseDetail | null> {
  const [row] = await DataBase.instance.sequelize.query<RawExpenseRow>(EXPENSE_DETAIL_SQL, {
    type: QueryTypes.SELECT,
    replacements: { id },
    transaction,
  });
  if (!row) return null;

  return {
    id: Number(row.id),
    quotation_id: Number(row.quotation_id),
    description: row.description,
    amount: Number(row.amount),
    category: row.category,
    spent_at: row.spent_at,
    payment_account_id: toNullableNumber(row.payment_account_id),
    payment_account_name: row.payment_account_name,
    is_deleted: Boolean(Number(row.is_deleted)),
    purchase_id: toNullableNumber(row.purchase_id),
    company_id: Number(row.company_id),
    business_unit_id: toNullableNumber(row.business_unit_id),
    quotation_status: row.quotation_status,
    corrections_count: Number(row.corrections_count),
  };
}
