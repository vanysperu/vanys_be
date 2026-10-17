import { Op, FindAndCountOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { IListOptions } from "../../../../interfaces/IListOptions.interface";
import { ClientAttributes } from "../../model/client.model";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";

interface ClientListOptions extends IListOptions<ClientAttributes> {
  companyId?: number | null;
  // Tienda a la que se limita al caller (ver core/rbac/businessUnitScope.ts)
  // — undefined = sin límite de tienda (ve todas las de su empresa).
  businessUnitId?: number;
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
}

const getClientsList = async (options: ClientListOptions): Promise<PaginatedResult<ClientAttributes>> => {
  const { where, page, limit, orderBy, orderDir, companyId, businessUnitId, searchTerm } = options;

  const companyWhere = companyId === null || companyId === undefined ? {} : { company_id: companyId };
  const businessUnitWhere = businessUnitId === undefined ? {} : { business_unit_id: businessUnitId };
  const searchWhere = searchTerm
    ? {
        [Op.or]: [
          { name: { [Op.like]: `%${searchTerm}%` } },
          { email: { [Op.like]: `%${searchTerm}%` } },
          { document_number: { [Op.like]: `%${searchTerm}%` } },
        ],
      }
    : {};

  const queryOptions: FindAndCountOptions<ClientAttributes> = {
    where: { ...where, ...companyWhere, ...businessUnitWhere, ...searchWhere },
    order: [[orderBy, orderDir]],
    limit,
    offset: getOffset(page, limit),
  };

  const { count, rows } = await DataBase.instance.client.findAndCountAll(queryOptions);

  return { data: rows, meta: buildPaginationMeta(count, page, limit) };
};

const getClientById = async (id: number) => {
  return DataBase.instance.client.findOne({ where: { id } });
};

export { getClientsList, getClientById };
