import { FindAndCountOptions, literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { IListOptions } from "../../../../interfaces/IListOptions.interface";
import { QuotationAttributes } from "../../model/quotation.model";
import { QuotationExpenseAttributes } from "../../model/quotation_expense.model";
import { loadCorrectionCounts } from "../../../money_correction/services/shared/corrections_count";
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

// Las cuatro listas (items, pagos, gastos, historial) van en consultas
// aparte (`separate`): en un solo JOIN se multiplicaban entre sí (10 items ×
// 60 eventos × 3 pagos × 5 gastos = 9 000 filas para armar UNA cotización), y
// Sequelize ignora el `order` de un include que no es `separate` — el
// historial no salía del más reciente al más antiguo, y el orden de los
// productos en el PDF dependía de cómo resolviera MySQL el JOIN.
const getQuotationById = async (id: number) => {
  return DataBase.instance.quotation.findOne({
    where: { id },
    include: [
      { association: "client" },
      { association: "businessUnit", attributes: ["id", "business_code", "address"] },
      {
        association: "items",
        separate: true,
        // Mismo orden en que se cargaron en el formulario.
        order: [["id", "ASC"]],
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
      {
        association: "payments",
        separate: true,
        order: [["id", "ASC"]],
        include: [{ association: "actor", attributes: ACTOR_ATTRIBUTES }],
      },
      {
        association: "expenses",
        separate: true,
        order: [["id", "ASC"]],
        include: [{ association: "actor", attributes: ACTOR_ATTRIBUTES }],
      },
      {
        association: "events",
        separate: true,
        include: [{ association: "actor", attributes: ACTOR_ATTRIBUTES }],
        // Del más reciente al más antiguo (QuotationTimeline.tsx lo muestra
        // así); el id desempata eventos del mismo segundo.
        order: [
          ["created_at", "DESC"],
          ["id", "DESC"],
        ],
      },
    ],
  });
};

// Gasto tal como lo muestra la pestaña Gastos: con `is_deleted` (los anulados
// se ven tachados y no suman), la compra a la que pertenece (purchase_id:
// esos se corrigen/anulan como compra) y cuántas correcciones tiene.
export type QuotationExpenseListItem = QuotationExpenseAttributes & {
  purchase_id: number | null;
  corrections_count: number;
};

type QuotationDetailJson = QuotationAttributes & { expenses?: QuotationExpenseAttributes[] };

/**
 * Detalle de la cotización para la pantalla (GET /quotation/find/:id): el de
 * getQuotationById más, en cada gasto, purchase_id y corrections_count. Dos
 * consultas por IN sobre los ids de los gastos (nunca una por gasto). El PDF
 * sigue usando getQuotationById (no necesita esto).
 */
const getQuotationDetailById = async (id: number) => {
  const quotation = await getQuotationById(id);
  if (!quotation) return null;

  // `include` no se refleja en el tipo de toJSON() (misma limitación de
  // Sequelize comentada en quotation_pdf.service.ts): paso por `unknown`.
  const plain = quotation.toJSON() as unknown as QuotationDetailJson;
  const expenses = plain.expenses ?? [];
  const expenseIds = expenses.map((expense) => Number(expense.id));

  const [purchases, correctionCounts] = await Promise.all([
    expenseIds.length === 0
      ? Promise.resolve([])
      : DataBase.instance.purchase_order_item_purchase.findAll({
          where: { quotation_expense_id: expenseIds },
          attributes: ["id", "quotation_expense_id"],
        }),
    loadCorrectionCounts("quotation_expense", expenseIds),
  ]);
  const purchaseIdByExpense = new Map(purchases.map((purchase) => [Number(purchase.quotation_expense_id), purchase.id]));

  const enrichedExpenses: QuotationExpenseListItem[] = expenses.map((expense) => ({
    ...expense,
    purchase_id: purchaseIdByExpense.get(Number(expense.id)) ?? null,
    corrections_count: correctionCounts.get(Number(expense.id)) ?? 0,
  }));

  return { ...plain, expenses: enrichedExpenses };
};

export { getQuotationsList, getQuotationById, getQuotationDetailById };
