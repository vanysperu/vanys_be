import { IToken } from "../../../../interfaces/IToken.interface";
import { buildPaginationMeta, getOffset, PaginationMeta } from "../../../../../core/utils/paginate";
import { DataBase } from "../../../../../database";
import { QUOTATION_MOCKUP_LIST_ATTRIBUTES } from "../../model/quotation_mockup.model";
import { assertQuotationReadable, QuotationMockupDto, toMockupDto } from "./mockup_shared";

// GET /quotation/:id/mockups — diseños activos de la cotización, del más nuevo
// al más viejo. Paginado (CLAUDE.md §4); los bytes nunca se leen acá.
export async function listMockupsService(
  quotationId: number,
  user: IToken,
  pagination: { page: number; limit: number }
): Promise<{ data: QuotationMockupDto[]; meta: PaginationMeta }> {
  await assertQuotationReadable(quotationId, user);
  const { rows, count } = await DataBase.instance.quotation_mockup.findAndCountAll({
    where: { quotation_id: quotationId, active: true },
    attributes: QUOTATION_MOCKUP_LIST_ATTRIBUTES,
    include: [{ association: "actor", attributes: ["name", "paternal_lastname"] }],
    order: [
      ["created_at", "DESC"],
      ["id", "DESC"],
    ],
    limit: pagination.limit,
    offset: getOffset(pagination.page, pagination.limit),
  });
  return { data: rows.map(toMockupDto), meta: buildPaginationMeta(count, pagination.page, pagination.limit) };
}
