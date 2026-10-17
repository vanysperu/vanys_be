import { FindAndCountOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { IListOptions } from "../../../../interfaces/IListOptions.interface";
import { BusinessUnitAttributes } from "../../models/business_unit.models";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";

interface BusinessUnitListOptions extends IListOptions<BusinessUnitAttributes> {
  companyId?: number | null;
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
}

const getBusinessUnitsList = async (
  options: BusinessUnitListOptions
): Promise<PaginatedResult<BusinessUnitAttributes>> => {
  try {
    const { where, page, limit, orderBy, orderDir, companyId } = options;

    const companyWhere = companyId === null || companyId === undefined ? {} : { company_id: companyId };

    // Igual que en company.service.ts: no forzar is_deleted:false acá, o una
    // tienda deshabilitada desaparecería para siempre sin forma de
    // reactivarla desde la UI de gestión.
    const queryOptions: FindAndCountOptions<BusinessUnitAttributes> = {
      where: { ...where, ...companyWhere },
      order: [[orderBy, orderDir]],
      limit,
      offset: getOffset(page, limit),
    };

    const { count, rows } = await DataBase.instance.business_unit.findAndCountAll(queryOptions);

    return { data: rows, meta: buildPaginationMeta(count, page, limit) };
  } catch (error) {
    throw error;
  }
};

const getBusinessUnitById = async (id: number) => {
  try {
    return await DataBase.instance.business_unit.findOne({ where: { id } });
  } catch (error) {
    throw error;
  }
};

export { getBusinessUnitsList, getBusinessUnitById };
