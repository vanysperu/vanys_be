import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../core/utils/paginate";
import { utcToBusinessParts } from "../../../../utils/dateUtils";
import { InvoiceDriveStatus, InvoiceType } from "../model/invoice.model";
import { InvoiceDto, InvoiceListFilter, InvoiceListSummary } from "../types/invoice.types";
import { quotationCode } from "./shared/drive_copy";
import {
  INVOICE_SEARCH_SQL,
  invoiceDescription,
  invoiceQuotationCodes,
  invoiceSearchReplacements,
  loadInvoicePurchases,
} from "./shared/invoice_purchases";

interface InvoiceRow {
  id: number;
  type: InvoiceType;
  quotation_id: number;
  description: string;
  company_id: number;
  company_name: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  file_uploaded_at: Date | null;
  uploader_name: string | null;
  stored_in_system: number | boolean;
  drive_status: InvoiceDriveStatus;
  drive_error: string | null;
  created_at: Date;
  creator_name: string | null;
}

// Condiciones fijas (texto de este archivo); los valores van bindeados.
const scopeConditions = (filter: InvoiceListFilter) => {
  const conditions = ["(:companyId IS NULL OR i.company_id = :companyId)"];
  if (filter.businessUnitId !== undefined) conditions.push("(i.business_unit_id IS NULL OR i.business_unit_id = :businessUnitId)");
  if (filter.type) conditions.push("i.type = :type");
  if (filter.drive) conditions.push("i.drive_status = :drive");
  if (filter.search) conditions.push(INVOICE_SEARCH_SQL);
  if (filter.dateFrom) conditions.push("DATE(CONVERT_TZ(i.created_at, '+00:00', '-05:00')) >= :dateFrom");
  if (filter.dateTo) conditions.push("DATE(CONVERT_TZ(i.created_at, '+00:00', '-05:00')) <= :dateTo");
  return conditions;
};

const toMoney = (value: number): number => Math.round(value * 100) / 100;

const FILE_CONDITION = { pending: "i.file_name IS NULL", uploaded: "i.file_name IS NOT NULL" } as const;

/**
 * Facturas emitidas y de compras (pedido explícito del usuario: "tener mapeadas
 * todas las facturas"), paginadas. El resumen cuenta las que faltan subir con
 * los mismos filtros, para el aviso "Faltan subir (N)".
 */
export async function listInvoicesService(
  filter: InvoiceListFilter
): Promise<PaginatedResult<InvoiceDto> & { summary: InvoiceListSummary }> {
  const scope = scopeConditions(filter);
  const conditions = filter.file ? [...scope, FILE_CONDITION[filter.file]] : scope;
  const replacements = {
    companyId: filter.companyId,
    businessUnitId: filter.businessUnitId ?? null,
    type: filter.type ?? null,
    drive: filter.drive ?? null,
    ...invoiceSearchReplacements(filter.search),
    dateFrom: filter.dateFrom ?? null,
    dateTo: filter.dateTo ?? null,
  };
  const where = conditions.join(" AND ");
  const scopeWhere = scope.join(" AND ");

  const [[countRow], [summaryRow], rows] = await Promise.all([
    DataBase.instance.sequelize.query(`SELECT COUNT(*) AS total FROM invoice i WHERE ${where}`, {
      type: QueryTypes.SELECT,
      replacements,
    }) as Promise<{ total: number | string }[]>,
    DataBase.instance.sequelize.query(
      `SELECT SUM(i.file_name IS NULL) AS pending_count, SUM(i.drive_status = 'failed') AS drive_failed_count
       FROM invoice i WHERE ${scopeWhere}`,
      { type: QueryTypes.SELECT, replacements }
    ) as Promise<{ pending_count: number | string | null; drive_failed_count: number | string | null }[]>,
    DataBase.instance.sequelize.query(
      `SELECT i.id, i.type, i.quotation_id, i.description, i.company_id, c.business_name AS company_name,
              i.file_name, i.mime_type, i.size_bytes, i.file_uploaded_at,
              TRIM(CONCAT(COALESCE(up.name, ''), ' ', COALESCE(up.paternal_lastname, ''))) AS uploader_name,
              i.stored_in_system, i.drive_status, i.drive_error, i.created_at,
              TRIM(CONCAT(COALESCE(cr.name, ''), ' ', COALESCE(cr.paternal_lastname, ''))) AS creator_name
       FROM invoice i
       LEFT JOIN company c ON c.id = i.company_id
       LEFT JOIN \`user\` up ON up.id = i.file_uploaded_by
       LEFT JOIN \`user\` cr ON cr.id = i.created_by
       WHERE ${where}
       ORDER BY i.created_at DESC, i.id DESC
       LIMIT :limit OFFSET :offset`,
      {
        type: QueryTypes.SELECT,
        replacements: { ...replacements, limit: filter.limit, offset: (filter.page - 1) * filter.limit },
      }
    ) as Promise<InvoiceRow[]>,
  ]);

  // Compras de todas las facturas de la página, en una sola consulta.
  const purchasesByInvoice = await loadInvoicePurchases(rows.map((row) => Number(row.id)));

  return {
    data: rows.map((row) => {
      const purchases = purchasesByInvoice.get(Number(row.id)) ?? [];
      return {
        id: Number(row.id),
        type: row.type,
        quotation_id: Number(row.quotation_id),
        quotation_code: quotationCode(Number(row.quotation_id)),
        quotation_codes: invoiceQuotationCodes(Number(row.quotation_id), purchases),
        purchases,
        purchases_total: toMoney(purchases.reduce((total, line) => total + line.amount, 0)),
        description: invoiceDescription(row.description, purchases),
        company_id: Number(row.company_id),
        company_name: row.company_name,
        has_file: row.file_name !== null,
        file_name: row.file_name,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes === null ? null : Number(row.size_bytes),
        file_uploaded_at: row.file_uploaded_at ? utcToBusinessParts(row.file_uploaded_at) : null,
        file_uploaded_by_name: row.uploader_name || null,
        stored_in_system: Boolean(row.stored_in_system),
        drive_status: row.drive_status,
        drive_error: row.drive_error,
        created_at: utcToBusinessParts(row.created_at),
        created_by_name: row.creator_name || null,
      };
    }),
    meta: buildPaginationMeta(Number(countRow?.total ?? 0), filter.page, filter.limit),
    summary: {
      pending_count: Number(summaryRow?.pending_count ?? 0),
      drive_failed_count: Number(summaryRow?.drive_failed_count ?? 0),
    },
  };
}
