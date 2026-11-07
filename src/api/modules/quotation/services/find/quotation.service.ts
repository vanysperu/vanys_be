import { FindAndCountOptions, literal, QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { IListOptions } from "../../../../interfaces/IListOptions.interface";
import { QuotationAttributes } from "../../model/quotation.model";
import { QuotationExpenseAttributes } from "../../model/quotation_expense.model";
import { QuotationItemAttributes } from "../../model/quotation_item.model";
import { FundingSource } from "../../../purchase_order/model/purchase_order_item_purchase.model";
import { EmployeeDebtStatus } from "../../../employee_debt/model/employee_debt.model";
import { loadProductVariants, variantsOf } from "../shared/item_variant";
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

// Columnas por las que se puede ordenar el listado. `orderBy` llega del query:
// una columna que no existe respondía 500.
const SORTABLE_COLUMNS = new Set(["created_at", "status_changed_at", "updated_at", "total", "id"]);

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
    // El id desempata: con fechas iguales, una página no repite ni salta filas.
    order: [
      [SORTABLE_COLUMNS.has(orderBy) ? orderBy : "created_at", orderDir],
      ["id", orderDir],
    ],
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
          // Con sku/requires_customization/is_deleted el formulario de
          // "Completar cotización" (pedido de la web) arma el item aunque el
          // producto no esté entre los que carga su selector.
          {
            association: "product",
            attributes: [
              "id",
              "company_id",
              "name",
              "sku",
              "price_unit",
              "price_hundred",
              "price_half_thousand",
              "price_thousand",
              "requires_customization",
              // Para mostrar el pedido mínimo junto a la cantidad (informativo).
              "min_order_quantity",
              "is_deleted",
            ],
          },
          {
            association: "technique",
            attributes: ["id", "company_id", "name", "price_unit", "price_hundred", "price_half_thousand", "price_thousand", "is_deleted"],
          },
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
  // Quién puso la plata de la compra (null = gasto que no es compra).
  purchase_funding_source: FundingSource | null;
  // Gasto manual con plata de un trabajador: a quién se le debe y cómo va.
  paid_by_user_name: string | null;
  debt_status: EmployeeDebtStatus | null;
  corrections_count: number;
};

type QuotationDetailJson = QuotationAttributes & {
  expenses?: QuotationExpenseAttributes[];
  items?: (QuotationItemAttributes & { product?: object | null })[];
};

/**
 * Detalle de la cotización para la pantalla (GET /quotation/find/:id): el de
 * getQuotationById más, en cada gasto, purchase_id y corrections_count. Dos
 * consultas por IN sobre los ids de los gastos (nunca una por gasto). El PDF
 * sigue usando getQuotationById (no necesita esto).
 */
// Deudas vigentes de los gastos manuales, en UNA consulta.
const loadExpenseDebts = async (expenseIds: number[]) => {
  if (expenseIds.length === 0) return new Map<number, { user_name: string; status: EmployeeDebtStatus }>();
  const rows = await DataBase.instance.sequelize.query<{ quotation_expense_id: number | string; status: EmployeeDebtStatus; user_name: string }>(
    `SELECT ed.quotation_expense_id, ed.status, CONCAT_WS(' ', u.name, u.paternal_lastname) AS user_name
     FROM employee_debt ed
     INNER JOIN user u ON u.id = ed.user_id
     WHERE ed.quotation_expense_id IN (:expenseIds) AND ed.status <> 'cancelled'`,
    { type: QueryTypes.SELECT, replacements: { expenseIds } }
  );
  return new Map(rows.map((row) => [Number(row.quotation_expense_id), { user_name: row.user_name, status: row.status }]));
};

const getQuotationDetailById = async (id: number) => {
  const quotation = await getQuotationById(id);
  if (!quotation) return null;

  // `include` no se refleja en el tipo de toJSON() (misma limitación de
  // Sequelize comentada en quotation_pdf.service.ts): paso por `unknown`.
  const plain = quotation.toJSON() as unknown as QuotationDetailJson;
  const expenses = plain.expenses ?? [];
  const expenseIds = expenses.map((expense) => Number(expense.id));

  const items = plain.items ?? [];

  const [purchases, correctionCounts, variantsByProduct, expenseDebts] = await Promise.all([
    expenseIds.length === 0
      ? Promise.resolve([])
      : DataBase.instance.purchase_order_item_purchase.findAll({
          where: { quotation_expense_id: expenseIds },
          attributes: ["id", "quotation_expense_id", "funding_source"],
        }),
    loadCorrectionCounts("quotation_expense", expenseIds),
    loadProductVariants(items.map((item) => Number(item.product_id))),
    loadExpenseDebts(expenseIds),
  ]);
  const purchaseByExpense = new Map(purchases.map((purchase) => [Number(purchase.quotation_expense_id), purchase]));

  const enrichedExpenses: QuotationExpenseListItem[] = expenses.map((expense) => ({
    ...expense,
    purchase_id: purchaseByExpense.get(Number(expense.id))?.id ?? null,
    purchase_funding_source: purchaseByExpense.get(Number(expense.id))?.funding_source ?? null,
    paid_by_user_name: expenseDebts.get(Number(expense.id))?.user_name ?? null,
    debt_status: expenseDebts.get(Number(expense.id))?.status ?? null,
    corrections_count: correctionCounts.get(Number(expense.id)) ?? 0,
  }));

  // Colores y códigos del producto de cada item: el formulario de completar
  // los necesita aunque el producto no esté en su selector (carga hasta 100).
  const enrichedItems = items.map((item) =>
    item.product ? { ...item, product: { ...item.product, ...variantsOf(variantsByProduct, Number(item.product_id)) } } : item
  );

  return { ...plain, items: enrichedItems, expenses: enrichedExpenses };
};

export { getQuotationsList, getQuotationById, getQuotationDetailById };
