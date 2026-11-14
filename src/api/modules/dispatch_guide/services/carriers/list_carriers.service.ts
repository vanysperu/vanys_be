import { Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import type { SupplierAttributes } from "../../../supplier/model/supplier.model";
import type { CarrierDto } from "../../types/dispatch_guide.types";

// Transportistas para el transporte público de la guía: los proveedores
// activos marcados como transportista. Endpoint propio porque quien arma la
// guía (por ejemplo, el Gestor) no necesariamente ve el módulo Proveedores.
export const listCarriersService = async (params: {
  companyId: number | null;
  page: number;
  limit: number;
  searchTerm?: string;
}): Promise<PaginatedResult<CarrierDto>> => {
  const conditions: WhereOptions<SupplierAttributes>[] = [{ is_carrier: true }, { active: true }];
  if (params.companyId !== null) conditions.push({ company_id: params.companyId });
  const term = params.searchTerm?.trim();
  if (term) conditions.push({ [Op.or]: [{ name: { [Op.like]: `%${term}%` } }, { document_number: { [Op.like]: `%${term}%` } }] });

  const { count, rows } = await DataBase.instance.supplier.findAndCountAll({
    where: { [Op.and]: conditions },
    attributes: ["id", "name", "document_number", "mtc_registration"],
    order: [
      ["name", "asc"],
      ["id", "asc"],
    ],
    limit: params.limit,
    offset: getOffset(params.page, params.limit),
  });
  return {
    data: rows.map((supplier) => ({
      id: Number(supplier.id),
      name: supplier.name,
      document_number: supplier.document_number,
      mtc_registration: supplier.mtc_registration,
    })),
    meta: buildPaginationMeta(count, params.page, params.limit),
  };
};
