import { Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { IToken } from "../../../../interfaces/IToken.interface";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import type { DocStatus, DocType, StockDocumentAttributes } from "../../model/inventory.models";
import type { DocumentDto } from "../../types/inventory.types";
import { toDocumentDtos } from "./document_shared";

interface ListDocumentsParams {
  companyId: number;
  page: number;
  limit: number;
  docType?: DocType;
  status?: DocStatus;
  warehouseId?: number;
  dateFrom?: string;
  dateTo?: string;
}

// Documentos de la empresa, paginados. Un usuario atado a una tienda (sin
// "ver todas las tiendas") ve los de sus almacenes, también las
// transferencias que llegan a ellos.
export const listDocumentsService = async (params: ListDocumentsParams, user: IToken): Promise<PaginatedResult<DocumentDto>> => {
  const conditions: WhereOptions<StockDocumentAttributes>[] = [{ company_id: params.companyId }];
  if (params.docType) conditions.push({ doc_type: params.docType });
  if (params.status) conditions.push({ status: params.status });
  if (params.warehouseId) conditions.push({ [Op.or]: [{ warehouse_id: params.warehouseId }, { target_warehouse_id: params.warehouseId }] });
  if (params.dateFrom) conditions.push({ document_date: { [Op.gte]: params.dateFrom } });
  if (params.dateTo) conditions.push({ document_date: { [Op.lte]: params.dateTo } });
  if (!user.isSystem && user.businessUnitId && !user.canViewAllBusinessUnits) {
    const own = await DataBase.instance.warehouse.findAll({ where: { company_id: params.companyId, business_unit_id: user.businessUnitId }, attributes: ["id"] });
    const ids = own.map((warehouse) => Number(warehouse.id));
    conditions.push({ [Op.or]: [{ warehouse_id: { [Op.in]: ids } }, { target_warehouse_id: { [Op.in]: ids } }] });
  }

  const { count, rows } = await DataBase.instance.stock_document.findAndCountAll({
    where: { [Op.and]: conditions },
    order: [
      ["created_at", "DESC"],
      ["id", "DESC"],
    ],
    limit: params.limit,
    offset: getOffset(params.page, params.limit),
  });
  return { data: await toDocumentDtos(rows, user, false), meta: buildPaginationMeta(count, params.page, params.limit) };
};
