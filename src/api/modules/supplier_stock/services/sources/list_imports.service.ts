import { DataBase } from "../../../../../database";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import { utcToBusinessParts } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import { findSourceForCaller } from "../shared/source_shared";
import type { StockImportDto } from "../../types/supplier_stock.types";

// Historial de lecturas de una fuente, de la más nueva a la más vieja.
export const listImportsService = async (
  sourceId: number,
  user: IToken,
  page: number,
  limit: number
): Promise<PaginatedResult<StockImportDto>> => {
  await findSourceForCaller(sourceId, user);
  const { count, rows } = await DataBase.instance.supplier_stock_import.findAndCountAll({
    where: { source_id: sourceId },
    order: [
      ["started_at", "DESC"],
      ["id", "DESC"],
    ],
    limit,
    offset: getOffset(page, limit),
  });
  return {
    data: rows.map((row) => ({
      id: Number(row.id),
      trigger_type: row.trigger_type,
      status: row.status,
      rows_read: row.rows_read,
      rows_valid: row.rows_valid,
      error: row.error,
      startedAt: utcToBusinessParts(row.started_at),
      finishedAt: row.finished_at ? utcToBusinessParts(row.finished_at) : null,
    })),
    meta: buildPaginationMeta(count, page, limit),
  };
};
