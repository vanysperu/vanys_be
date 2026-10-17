import { FindAndCountOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { IListOptions } from "../../../../interfaces/IListOptions.interface";
import { CompanyAttributes } from "../../model/company.model";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";

interface CompanyListOptions extends IListOptions<CompanyAttributes> {
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
}

const getCompaniesList = async (options: CompanyListOptions): Promise<PaginatedResult<CompanyAttributes>> => {
  try {
    const { where, page, limit, orderBy, orderDir } = options;

    // A diferencia de un listado operativo, esta es la pantalla de gestión de
    // empresas: las deshabilitadas se siguen mostrando (con su estado), para
    // poder reactivarlas. Si se forzara is_deleted:false acá, una empresa
    // deshabilitada desaparecería para siempre y no habría forma de
    // reactivarla desde la UI.
    const queryOptions: FindAndCountOptions<CompanyAttributes> = {
      where: { ...where },
      order: [[orderBy, orderDir]],
      limit,
      offset: getOffset(page, limit),
    };

    const { count, rows } = await DataBase.instance.company.findAndCountAll(queryOptions);

    return { data: rows, meta: buildPaginationMeta(count, page, limit) };
  } catch (error) {
    throw error;
  }
};

const getCompanyById = async (id: number) => {
  try {
    return await DataBase.instance.company.findOne({ where: { id } });
  } catch (error) {
    throw error;
  }
};

export { getCompaniesList, getCompanyById };
