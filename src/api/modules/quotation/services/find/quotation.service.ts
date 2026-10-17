import { FindAndCountOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { IListOptions } from "../../../../interfaces/IListOptions.interface";
import { QuotationAttributes } from "../../model/quotation.model";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";

interface QuotationListOptions extends IListOptions<QuotationAttributes> {
  companyId?: number | null;
  // Tienda a la que se limita al caller (ver core/rbac/businessUnitScope.ts)
  // — undefined = sin límite de tienda (ve todas las de su empresa).
  businessUnitId?: number;
  status?: string;
  clientId?: number;
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
}

const getQuotationsList = async (options: QuotationListOptions): Promise<PaginatedResult<QuotationAttributes>> => {
  const { where, page, limit, orderBy, orderDir, companyId, businessUnitId, status, clientId } = options;

  const companyWhere = companyId === null || companyId === undefined ? {} : { company_id: companyId };
  const businessUnitWhere = businessUnitId === undefined ? {} : { business_unit_id: businessUnitId };
  const statusWhere = status ? { status } : {};
  const clientWhere = clientId ? { client_id: clientId } : {};

  const queryOptions: FindAndCountOptions<QuotationAttributes> = {
    where: { ...where, ...companyWhere, ...businessUnitWhere, ...statusWhere, ...clientWhere },
    order: [[orderBy, orderDir]],
    limit,
    offset: getOffset(page, limit),
    include: [{ association: "client", attributes: ["id", "name"] }],
  };

  const { count, rows } = await DataBase.instance.quotation.findAndCountAll(queryOptions);

  return { data: rows, meta: buildPaginationMeta(count, page, limit) };
};

const ACTOR_ATTRIBUTES = ["id", "name", "paternal_lastname"];

const getQuotationById = async (id: number) => {
  return DataBase.instance.quotation.findOne({
    where: { id },
    include: [
      { association: "client" },
      { association: "businessUnit", attributes: ["id", "business_code", "address"] },
      {
        association: "items",
        include: [
          {
            association: "product",
            attributes: ["id", "name", "price_unit", "price_hundred", "price_half_thousand", "price_thousand"],
          },
          { association: "technique", attributes: ["id", "name", "extra_type", "extra_value"] },
          // "stage" es una fila de general_variable (category=production_stage):
          // name = nombre de la etapa, ref1 = color, ref2 = posición/orden.
          { association: "stage", attributes: ["id", "name", "ref1", "ref2"] },
        ],
      },
      { association: "payments", include: [{ association: "actor", attributes: ACTOR_ATTRIBUTES }] },
      { association: "expenses", include: [{ association: "actor", attributes: ACTOR_ATTRIBUTES }] },
      {
        association: "events",
        include: [{ association: "actor", attributes: ACTOR_ATTRIBUTES }],
        order: [["created_at", "DESC"]],
      },
    ],
  });
};

export { getQuotationsList, getQuotationById };
