import { FindAndCountOptions, literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { IListOptions } from "../../../../interfaces/IListOptions.interface";
import { QuotationAttributes } from "../../model/quotation.model";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import { buildBusinessDateRange } from "../../../../../core/utils/listFilters";
import { RECEIVABLE_MIN_BALANCE, RECEIVABLE_STATUSES } from "../../../receivable/services/find/receivable.service";

// Totales de TODO lo filtrado (no solo de la página), calculados en la base.
// El Panel principal los usaba sumando en el navegador las últimas 100
// cotizaciones, con un criterio distinto al de "Por cobrar" (bug reportado
// por el usuario: "que los campos tomen la info que deben").
export interface QuotationListSummary {
  // Mismo criterio que el módulo receivable (Por cobrar).
  receivable_balance: number;
  receivable_count: number;
  // Vencidas: el cliente no respondió antes de la fecha de validez.
  expired_balance: number;
  expired_count: number;
}

// Estados fijos del código (no vienen del cliente); igual se escapan.
const RECEIVABLE_CONDITION = () =>
  `status IN (${RECEIVABLE_STATUSES.map((status) => DataBase.instance.sequelize.escape(status)).join(", ")})` +
  ` AND total - total_paid >= ${RECEIVABLE_MIN_BALANCE}`;

interface QuotationListOptions extends IListOptions<QuotationAttributes> {
  companyId?: number | null;
  // Tienda a la que se limita al caller (ver core/rbac/businessUnitScope.ts)
  // — undefined = sin límite de tienda (ve todas las de su empresa).
  businessUnitId?: number;
  status?: string;
  clientId?: number;
  // Quién creó la cotización.
  createdBy?: number;
  // Rango de fecha de emisión (días de Lima, YYYY-MM-DD).
  dateFrom?: unknown;
  dateTo?: unknown;
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
}

const getQuotationsList = async (
  options: QuotationListOptions
): Promise<PaginatedResult<QuotationAttributes> & { summary: QuotationListSummary }> => {
  const { where, page, limit, orderBy, orderDir, companyId, businessUnitId, status, clientId, createdBy, dateFrom, dateTo } =
    options;

  const companyWhere = companyId === null || companyId === undefined ? {} : { company_id: companyId };
  const businessUnitWhere = businessUnitId === undefined ? {} : { business_unit_id: businessUnitId };
  const statusWhere = status ? { status } : {};
  const clientWhere = clientId ? { client_id: clientId } : {};
  const createdByWhere = createdBy ? { created_by: createdBy } : {};
  const createdAt = buildBusinessDateRange(dateFrom, dateTo);
  const dateWhere = createdAt ? { created_at: createdAt } : {};

  const queryOptions: FindAndCountOptions<QuotationAttributes> = {
    where: {
      ...where,
      ...companyWhere,
      ...businessUnitWhere,
      ...statusWhere,
      ...clientWhere,
      ...createdByWhere,
      ...dateWhere,
    },
    order: [[orderBy, orderDir]],
    limit,
    offset: getOffset(page, limit),
    include: [{ association: "client", attributes: ["id", "name"] }],
  };

  const receivable = RECEIVABLE_CONDITION();
  const [{ count, rows }, summaryRow] = await Promise.all([
    DataBase.instance.quotation.findAndCountAll(queryOptions),
    DataBase.instance.quotation.findOne({
      attributes: [
        [literal(`COALESCE(SUM(CASE WHEN ${receivable} THEN total - total_paid ELSE 0 END), 0)`), "receivable_balance"],
        [literal(`COUNT(CASE WHEN ${receivable} THEN 1 END)`), "receivable_count"],
        [literal(`COALESCE(SUM(CASE WHEN status = 'expired' THEN total - total_paid ELSE 0 END), 0)`), "expired_balance"],
        [literal(`COUNT(CASE WHEN status = 'expired' THEN 1 END)`), "expired_count"],
      ],
      where: queryOptions.where,
      raw: true,
    }) as Promise<Record<keyof QuotationListSummary, string | number> | null>,
  ]);

  const summary: QuotationListSummary = {
    receivable_balance: Number(summaryRow?.receivable_balance ?? 0),
    receivable_count: Number(summaryRow?.receivable_count ?? 0),
    expired_balance: Number(summaryRow?.expired_balance ?? 0),
    expired_count: Number(summaryRow?.expired_count ?? 0),
  };

  return { data: rows, meta: buildPaginationMeta(count, page, limit), summary };
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
          { association: "technique", attributes: ["id", "name"] },
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
