import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { utcToBusinessParts } from "../../../../utils/dateUtils";
import { PurchaseInvoiceCandidate } from "../types/invoice.types";
import {
  INVOICE_SEARCH_SQL,
  invoiceDescription,
  invoiceQuotationCodes,
  invoiceSearchReplacements,
  loadInvoicePurchases,
} from "./shared/invoice_purchases";

const MAX_CANDIDATES = 20;

interface ItemStoreRow {
  company_id: number | string;
  business_unit_id: number | string | null;
}

interface CandidateRow {
  id: number | string;
  quotation_id: number | string;
  description: string;
  series_number: string | null;
  supplier_name: string | null;
  file_name: string | null;
  created_at: Date;
  creator_name: string | null;
}

/**
 * Facturas de compra a las que se puede sumar la compra de un item (pedido
 * explícito del usuario: "en una factura pueden estar varios productos"): las
 * más recientes de la MISMA empresa y tienda del item, que es lo único que
 * acepta linkPurchaseToInvoice. Quien llama ya validó que puede tocar el item.
 * Con `search` encuentra también las más antiguas (por producto o cotización).
 */
export async function listPurchaseCandidatesService(itemId: number, search: string | undefined): Promise<PurchaseInvoiceCandidate[]> {
  const [item] = (await DataBase.instance.sequelize.query(
    `SELECT po.company_id, q.business_unit_id
     FROM purchase_order_item poi
     INNER JOIN purchase_order po ON po.id = poi.purchase_order_id
     INNER JOIN quotation q ON q.id = po.quotation_id
     WHERE poi.id = :itemId`,
    { type: QueryTypes.SELECT, replacements: { itemId } }
  )) as ItemStoreRow[];
  if (!item) throw new AppError(404, "El item no existe");

  const rows = (await DataBase.instance.sequelize.query(
    `SELECT i.id, i.quotation_id, i.description, i.series_number, su.name AS supplier_name, i.file_name, i.created_at,
            TRIM(CONCAT(COALESCE(cr.name, ''), ' ', COALESCE(cr.paternal_lastname, ''))) AS creator_name
     FROM invoice i
     LEFT JOIN supplier su ON su.id = i.supplier_id
     LEFT JOIN \`user\` cr ON cr.id = i.created_by
     WHERE i.type = 'purchase' AND i.company_id = :companyId AND i.business_unit_id <=> :businessUnitId
       ${search ? `AND ${INVOICE_SEARCH_SQL}` : ""}
     ORDER BY i.created_at DESC, i.id DESC
     LIMIT :limit`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        companyId: Number(item.company_id),
        businessUnitId: item.business_unit_id === null ? null : Number(item.business_unit_id),
        limit: MAX_CANDIDATES,
        ...invoiceSearchReplacements(search),
      },
    }
  )) as CandidateRow[];

  const purchases = await loadInvoicePurchases(rows.map((row) => Number(row.id)));
  return rows.map((row) => {
    const lines = purchases.get(Number(row.id)) ?? [];
    return {
      id: Number(row.id),
      series_number: row.series_number,
      supplier_name: row.supplier_name,
      quotation_codes: invoiceQuotationCodes(Number(row.quotation_id), lines),
      description: invoiceDescription(row.description, lines),
      has_file: row.file_name !== null,
      created_at: utcToBusinessParts(row.created_at),
      created_by_name: row.creator_name || null,
    };
  });
}
