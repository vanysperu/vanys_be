import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { correctionsCountSql } from "../../../money_correction/services/shared/corrections_count";
import { FundingSource } from "../../model/purchase_order_item_purchase.model";

// Una compra como la muestran el checklist de la orden y el diálogo de
// corrección: con su gasto (fecha, cuenta), quién la pagó, su deuda con el
// trabajador (si la hay) y cuántas correcciones tiene (las correcciones de
// una compra se guardan con la fuente "quotation_expense" y el id de su gasto).
export interface PurchaseListItem {
  id: number;
  purchase_order_item_id: number;
  quotation_expense_id: number;
  quantity: number;
  amount: number;
  funding_source: FundingSource;
  paid_by_user_id: number | null;
  paid_by_user_name: string | null;
  is_deleted: boolean;
  spent_at: string;
  payment_account_id: number | null;
  payment_account_name: string | null;
  // Deuda VIGENTE (no anulada) con el trabajador; null si no hay.
  debt_id: number | null;
  debt_amount: number | null;
  debt_paid_amount: number | null;
  debt_status: string | null;
  corrections_count: number;
  // Factura de la compra (null = sin factura), si ya tiene archivo y cuántas
  // compras vigentes cubre (para avisar antes de sacarla de ahí).
  invoice_id: number | null;
  invoice_has_file: boolean;
  invoice_purchases_count: number;
  created_at: Date;
}

// Lo que necesita además el diálogo de corrección.
export interface PurchaseDetail extends PurchaseListItem {
  purchase_order_id: number;
  quotation_id: number;
  company_id: number;
  business_unit_id: number | null;
  product_name: string | null;
  item_quantity: number;
  // Cantidad comprada del item por las OTRAS compras vigentes (para el tope
  // "faltan X" al corregir la cantidad).
  other_purchased_quantity: number;
}

interface RawPurchaseRow {
  id: number | string;
  purchase_order_item_id: number | string;
  quotation_expense_id: number | string;
  quantity: number | string;
  amount: number | string;
  funding_source: FundingSource;
  paid_by_user_id: number | string | null;
  paid_by_user_name: string | null;
  is_deleted: number | boolean;
  spent_at: string;
  payment_account_id: number | string | null;
  payment_account_name: string | null;
  debt_id: number | string | null;
  debt_amount: number | string | null;
  debt_paid_amount: number | string | null;
  debt_status: string | null;
  corrections_count: number | string;
  invoice_id: number | string | null;
  invoice_has_file: number | string | null;
  invoice_purchases_count: number | string;
  created_at: Date;
}

interface RawPurchaseDetailRow extends RawPurchaseRow {
  purchase_order_id: number | string;
  quotation_id: number | string;
  company_id: number | string;
  business_unit_id: number | string | null;
  product_name: string | null;
  item_quantity: number | string;
  other_purchased_quantity: number | string;
}

const toNullableNumber = (value: number | string | null): number | null => (value === null ? null : Number(value));

// Columnas y joins comunes (texto fijo del código). La deuda que se muestra
// es la vigente: una anulada (compra pasada a plata de la empresa) no cuenta.
const PURCHASE_COLUMNS_SQL = `
  pop.id, pop.purchase_order_item_id, pop.quotation_expense_id, pop.quantity, pop.amount,
  pop.funding_source, pop.paid_by_user_id, CONCAT_WS(' ', pu.name, pu.paternal_lastname) AS paid_by_user_name,
  pop.is_deleted, DATE_FORMAT(qe.spent_at, '%Y-%m-%d') AS spent_at, qe.payment_account_id,
  pa.name AS payment_account_name, ed.id AS debt_id, ed.amount AS debt_amount,
  ed.paid_amount AS debt_paid_amount, ed.status AS debt_status,
  ${correctionsCountSql("quotation_expense", "pop.quotation_expense_id")} AS corrections_count,
  ip.invoice_id, inv.file_name IS NOT NULL AS invoice_has_file,
  (SELECT COUNT(*) FROM invoice_purchase sip
    INNER JOIN purchase_order_item_purchase spop ON spop.id = sip.purchase_id
    WHERE sip.invoice_id = ip.invoice_id AND spop.is_deleted = false) AS invoice_purchases_count,
  pop.created_at`;

const PURCHASE_JOINS_SQL = `
  INNER JOIN quotation_expense qe ON qe.id = pop.quotation_expense_id
  LEFT JOIN \`user\` pu ON pu.id = pop.paid_by_user_id
  LEFT JOIN general_variable pa ON pa.id = qe.payment_account_id
  LEFT JOIN employee_debt ed ON ed.purchase_order_item_purchase_id = pop.id AND ed.status <> 'cancelled'
  LEFT JOIN invoice_purchase ip ON ip.purchase_id = pop.id
  LEFT JOIN invoice inv ON inv.id = ip.invoice_id`;

const mapListRow = (row: RawPurchaseRow): PurchaseListItem => ({
  id: Number(row.id),
  purchase_order_item_id: Number(row.purchase_order_item_id),
  quotation_expense_id: Number(row.quotation_expense_id),
  quantity: Number(row.quantity),
  amount: Number(row.amount),
  funding_source: row.funding_source,
  paid_by_user_id: toNullableNumber(row.paid_by_user_id),
  paid_by_user_name: row.paid_by_user_name || null,
  is_deleted: Boolean(Number(row.is_deleted)),
  spent_at: row.spent_at,
  payment_account_id: toNullableNumber(row.payment_account_id),
  payment_account_name: row.payment_account_name,
  debt_id: toNullableNumber(row.debt_id),
  debt_amount: toNullableNumber(row.debt_amount),
  debt_paid_amount: toNullableNumber(row.debt_paid_amount),
  debt_status: row.debt_status,
  corrections_count: Number(row.corrections_count),
  invoice_id: toNullableNumber(row.invoice_id),
  invoice_has_file: Boolean(Number(row.invoice_has_file ?? 0)),
  invoice_purchases_count: Number(row.invoice_purchases_count),
  created_at: row.created_at,
});

/**
 * Compras (anuladas incluidas: se muestran tachadas) de varios items en UNA
 * consulta, agrupadas por item. Las usan el listado y el detalle de órdenes.
 */
export async function loadPurchasesByItemIds(itemIds: readonly number[]): Promise<Map<number, PurchaseListItem[]>> {
  if (itemIds.length === 0) return new Map();

  const rows = await DataBase.instance.sequelize.query<RawPurchaseRow>(
    `SELECT ${PURCHASE_COLUMNS_SQL}
     FROM purchase_order_item_purchase pop
     ${PURCHASE_JOINS_SQL}
     WHERE pop.purchase_order_item_id IN (:itemIds)
     ORDER BY pop.id ASC`,
    { type: QueryTypes.SELECT, replacements: { itemIds: [...new Set(itemIds)] } }
  );

  return rows.map(mapListRow).reduce((byItem, purchase) => {
    const current = byItem.get(purchase.purchase_order_item_id) ?? [];
    return byItem.set(purchase.purchase_order_item_id, [...current, purchase]);
  }, new Map<number, PurchaseListItem[]>());
}

/** Compra por id con todo lo que necesita el diálogo de corrección, o null. */
export async function findPurchaseById(id: number, transaction?: Transaction): Promise<PurchaseDetail | null> {
  const [row] = await DataBase.instance.sequelize.query<RawPurchaseDetailRow>(
    `SELECT ${PURCHASE_COLUMNS_SQL},
       poi.purchase_order_id, po.quotation_id, po.company_id, q.business_unit_id,
       pr.name AS product_name, poi.quantity AS item_quantity,
       (SELECT COALESCE(SUM(other.quantity), 0) FROM purchase_order_item_purchase other
        WHERE other.purchase_order_item_id = pop.purchase_order_item_id
          AND other.is_deleted = false AND other.id <> pop.id) AS other_purchased_quantity
     FROM purchase_order_item_purchase pop
     ${PURCHASE_JOINS_SQL}
     INNER JOIN purchase_order_item poi ON poi.id = pop.purchase_order_item_id
     INNER JOIN purchase_order po ON po.id = poi.purchase_order_id
     INNER JOIN quotation q ON q.id = po.quotation_id
     LEFT JOIN quotation_item qi ON qi.id = poi.quotation_item_id
     LEFT JOIN product pr ON pr.id = qi.product_id
     WHERE pop.id = :id`,
    { type: QueryTypes.SELECT, replacements: { id }, transaction }
  );
  if (!row) return null;

  return {
    ...mapListRow(row),
    purchase_order_id: Number(row.purchase_order_id),
    quotation_id: Number(row.quotation_id),
    company_id: Number(row.company_id),
    business_unit_id: toNullableNumber(row.business_unit_id),
    product_name: row.product_name,
    item_quantity: Number(row.item_quantity),
    other_purchased_quantity: Number(row.other_purchased_quantity),
  };
}
