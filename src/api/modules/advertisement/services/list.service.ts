import { Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../database";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../core/utils/paginate";
import { AdvertisementAttributes } from "../model/advertisement.model";
import { AdvertisementDto, AdvertisementListFilter } from "../types/advertisement.types";
import { toAdvertisementDtos } from "./shared/advertisement_mapper";

// Anuncios de una empresa (o de todas, para el Super Administrador), agrupados
// por zona y en el orden en que salen en la web. Paginado en la base.
export async function listAdvertisementsService(filter: AdvertisementListFilter): Promise<PaginatedResult<AdvertisementDto>> {
  const conditions: WhereOptions<AdvertisementAttributes>[] = [];
  if (filter.companyId !== null) conditions.push({ company_id: filter.companyId });
  if (filter.zone === "none") conditions.push({ zone_id: null });
  if (typeof filter.zone === "number") conditions.push({ zone_id: filter.zone });
  if (filter.status === "active") conditions.push({ is_active: true });
  if (filter.status === "inactive") conditions.push({ is_active: false });
  if (filter.title) conditions.push({ title: { [Op.like]: `%${filter.title}%` } });

  const { count, rows } = await DataBase.instance.advertisement.findAndCountAll({
    where: { [Op.and]: conditions },
    order: [
      ["company_id", "ASC"],
      ["zone_id", "ASC"],
      ["position", "ASC"],
      ["id", "ASC"],
    ],
    limit: filter.limit,
    offset: getOffset(filter.page, filter.limit),
  });

  return { data: await toAdvertisementDtos(rows), meta: buildPaginationMeta(count, filter.page, filter.limit) };
}
