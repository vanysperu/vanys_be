import { Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import { addDaysToDateOnly, businessLocalToUtc } from "../../../../../utils/dateUtils";
import type { DispatchGuideAttributes } from "../../model/dispatch_guide.models";
import type { GuideSummaryDto, ListGuidesParams } from "../../types/dispatch_guide.types";
import { toGuideSummaryDtos } from "./guide_shared";

// Columnas por las que se puede ordenar (nunca lo que mande el cliente tal cual).
const SORTABLE = new Set(["created_at", "issue_date", "transfer_start_date", "number", "status"]);

// Día de Lima "YYYY-MM-DD" → instante UTC de su inicio (dateUtils, sin zona horaria a mano).
const limaDayStart = (date: string) => businessLocalToUtc(date, "00:00");
const limaNextDayStart = (date: string) => businessLocalToUtc(addDaysToDateOnly(date, 1), "00:00");

// Lista de condiciones + Op.and: un `where` armado con spreads condicionales
// dispara el chequeo de tipos de Sequelize (ver testing-gotchas).
const buildWhere = (params: ListGuidesParams): WhereOptions<DispatchGuideAttributes> => {
  const conditions: WhereOptions<DispatchGuideAttributes>[] = [];
  if (params.companyId !== null) conditions.push({ company_id: params.companyId });
  if (params.businessUnitId !== undefined) conditions.push({ business_unit_id: params.businessUnitId });
  if (params.statuses?.length) conditions.push({ status: { [Op.in]: params.statuses } });
  if (params.quotationId) conditions.push({ quotation_id: params.quotationId });
  if (params.dateFrom) conditions.push({ created_at: { [Op.gte]: limaDayStart(params.dateFrom) } });
  if (params.dateTo) conditions.push({ created_at: { [Op.lt]: limaNextDayStart(params.dateTo) } });
  const term = params.searchTerm?.trim();
  if (term) {
    const like = { [Op.like]: `%${term}%` };
    // "T001-45" busca por serie y número; el resto, por destinatario o dirección.
    const numberMatch = /^([A-Za-z0-9]{1,4})\s*-\s*(\d+)$/.exec(term);
    const options: WhereOptions<DispatchGuideAttributes>[] = [{ recipient_name: like }, { recipient_doc_number: like }, { destination_address: like }];
    if (numberMatch) options.push({ series: (numberMatch[1] ?? "").toUpperCase(), number: Number(numberMatch[2]) });
    if (/^\d+$/.test(term)) options.push({ number: Number(term) }, { quotation_id: Number(term) });
    conditions.push({ [Op.or]: options });
  }
  return { [Op.and]: conditions };
};

// Listado paginado (CLAUDE.md §4): LIMIT/OFFSET en la base; tienda y "tiene
// PDF" en dos consultas para toda la página.
export const listGuidesService = async (params: ListGuidesParams): Promise<PaginatedResult<GuideSummaryDto>> => {
  const orderBy = SORTABLE.has(params.orderBy) ? params.orderBy : "created_at";
  const { count, rows } = await DataBase.instance.dispatch_guide.findAndCountAll({
    where: buildWhere(params),
    order: [
      [orderBy, params.orderDir],
      ["id", params.orderDir],
    ],
    limit: params.limit,
    offset: getOffset(params.page, params.limit),
  });
  return { data: await toGuideSummaryDtos(rows), meta: buildPaginationMeta(count, params.page, params.limit) };
};
