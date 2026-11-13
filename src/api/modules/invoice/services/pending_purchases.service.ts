import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../core/utils/paginate";
import { utcToBusinessParts } from "../../../../utils/dateUtils";
import { PurchaseInvoiceStatus } from "../../purchase_order/model/purchase_order_item_purchase.model";
import { PendingPurchaseDto, PendingPurchaseFilter } from "../types/invoice.types";
import { quotationCode } from "./shared/drive_copy";
import { PENDING_PURCHASES_FROM, pendingScopeConditions } from "./shared/pending_purchases_sql";

interface PendingRow {
  purchase_id: number | string;
  invoice_status: PurchaseInvoiceStatus;
  product_name: string;
  quantity: number | string;
  amount: number | string;
  quotation_id: number | string;
  client_name: string | null;
  company_id: number | string;
  business_unit_id: number | string | null;
  business_unit_name: string | null;
  spent_at: string;
  created_at: Date;
  creator_name: string | null;
}

/**
 * Bandeja "Compras sin factura" (plan §4, punto 2): compras cuya factura llega
 * después, con el interruptor para ver también las que no llevan factura.
 * Paginada en la consulta; el resumen da el contador de la pestaña (solo las
 * pendientes, con el mismo alcance).
 */
export async function listPendingPurchasesService(
  filter: PendingPurchaseFilter
): Promise<PaginatedResult<PendingPurchaseDto> & { summary: { pending_count: number } }> {
  const scope = { companyId: filter.companyId, businessUnitId: filter.businessUnitId };
  const conditions = [
    ...pendingScopeConditions({ ...scope, includeNotRequired: filter.includeNotRequired }),
    ...(filter.storeId !== undefined ? ["q.business_unit_id = :storeId"] : []),
    ...(filter.quotationId !== undefined ? ["po.quotation_id = :quotationId"] : []),
    ...(filter.search ? ["(pr.name LIKE :search OR CAST(po.quotation_id AS CHAR) = :searchId OR cl.name LIKE :search)"] : []),
    ...(filter.dateFrom ? ["qe.spent_at >= :dateFrom"] : []),
    ...(filter.dateTo ? ["qe.spent_at <= :dateTo"] : []),
  ];
  const replacements = {
    companyId: filter.companyId,
    businessUnitId: filter.businessUnitId ?? null,
    storeId: filter.storeId ?? null,
    quotationId: filter.quotationId ?? null,
    search: filter.search ? `%${filter.search}%` : null,
    searchId: (filter.search ?? "").replace(/\D/g, "").replace(/^0+/, "") || null,
    dateFrom: filter.dateFrom ?? null,
    dateTo: filter.dateTo ?? null,
  };
  const joins = `${PENDING_PURCHASES_FROM}
    INNER JOIN quotation_expense qe ON qe.id = pop.quotation_expense_id
    INNER JOIN quotation_item qi ON qi.id = poi.quotation_item_id
    INNER JOIN product pr ON pr.id = qi.product_id
    LEFT JOIN client cl ON cl.id = q.client_id
    LEFT JOIN business_unit bu ON bu.id = q.business_unit_id
    LEFT JOIN \`user\` cr ON cr.id = pop.created_by`;
  const where = conditions.join(" AND ");

  const [[countRow], [summaryRow], rows] = await Promise.all([
    DataBase.instance.sequelize.query(`SELECT COUNT(*) AS total ${joins} WHERE ${where}`, {
      type: QueryTypes.SELECT,
      replacements,
    }) as Promise<{ total: number | string }[]>,
    DataBase.instance.sequelize.query(
      `SELECT COUNT(*) AS total ${PENDING_PURCHASES_FROM} WHERE ${pendingScopeConditions(scope).join(" AND ")}`,
      { type: QueryTypes.SELECT, replacements }
    ) as Promise<{ total: number | string }[]>,
    DataBase.instance.sequelize.query(
      `SELECT pop.id AS purchase_id, pop.invoice_status, pr.name AS product_name, pop.quantity, pop.amount,
              po.quotation_id, cl.name AS client_name, po.company_id, q.business_unit_id, bu.business_code AS business_unit_name,
              DATE_FORMAT(qe.spent_at, '%Y-%m-%d') AS spent_at, pop.created_at,
              TRIM(CONCAT(COALESCE(cr.name, ''), ' ', COALESCE(cr.paternal_lastname, ''))) AS creator_name
       ${joins}
       WHERE ${where}
       ORDER BY qe.spent_at DESC, pop.id DESC
       LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements: { ...replacements, limit: filter.limit, offset: (filter.page - 1) * filter.limit } }
    ) as Promise<PendingRow[]>,
  ]);

  return {
    data: rows.map((row) => ({
      purchase_id: Number(row.purchase_id),
      invoice_status: row.invoice_status,
      product_name: row.product_name,
      quantity: Number(row.quantity),
      amount: Number(row.amount),
      quotation_id: Number(row.quotation_id),
      quotation_code: quotationCode(Number(row.quotation_id)),
      client_name: row.client_name,
      company_id: Number(row.company_id),
      business_unit_id: row.business_unit_id === null ? null : Number(row.business_unit_id),
      business_unit_name: row.business_unit_name,
      spent_at: row.spent_at,
      created_at: utcToBusinessParts(row.created_at),
      created_by_name: row.creator_name || null,
    })),
    meta: buildPaginationMeta(Number(countRow?.total ?? 0), filter.page, filter.limit),
    summary: { pending_count: Number(summaryRow?.total ?? 0) },
  };
}
