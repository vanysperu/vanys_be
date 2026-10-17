import { Op, QueryTypes, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { CashMovementAttributes, CashMovementDirection, CashMovementModel } from "../../model/cash_movement.model";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";

// Shape normalizado común a las 3 fuentes que se juntan en un solo listado
// (pedido explícito del usuario: "lo que se registra en la cotización se
// listan ahí y los que se saca también se lista, toda entra y salida de
// dinero") — "manual" es la tabla cash_movement; "quotation_payment"/
// "quotation_expense" son los que YA se registran en sus propias pantallas
// (Pagos/Gastos de una cotización, y toda compra de una orden ya genera un
// gasto, ver purchase_order_item_purchase.service.ts) — nunca se duplican,
// solo se reflejan acá para tener un libro de caja único.
export interface CashMovementListItem {
  id: string;
  source: "manual" | "quotation_payment" | "quotation_expense";
  // Solo los movimientos "manual" se pueden deshabilitar desde este módulo
  // — los otros dos se gestionan desde su propia pantalla de origen.
  source_id: number;
  direction: CashMovementDirection;
  category: string | null;
  amount: number;
  description: string | null;
  occurred_at: string;
  quotation_id: number | null;
  purchase_order_id: number | null;
  business_unit_id: number | null;
  created_at: string;
}

export interface CashMovementListFilter {
  // null = is_system (ve todo). La tienda (businessUnitId) sigue el mismo
  // criterio de alcance ya usado en clientes/cotizaciones/usuarios (ver
  // core/rbac/businessUnitScope.ts).
  companyId: number | null;
  businessUnitId?: number;
  direction?: CashMovementDirection;
  category?: string;
  quotationId?: number;
  purchaseOrderId?: number;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}

interface RawPaymentRow {
  id: number;
  quotation_id: number;
  amount: string;
  method: string | null;
  notes: string | null;
  paid_at: string;
  created_at: Date;
  business_unit_id: number | null;
}

interface RawExpenseRow {
  id: number;
  quotation_id: number;
  amount: string;
  category: string | null;
  description: string;
  spent_at: string;
  created_at: Date;
  business_unit_id: number | null;
  purchase_order_id: number | null;
}

const getManualMovements = async (filter: CashMovementListFilter): Promise<CashMovementListItem[]> => {
  const where: WhereOptions<CashMovementAttributes> = { is_deleted: false };
  if (filter.companyId !== null) where.company_id = filter.companyId;
  if (filter.businessUnitId !== undefined) where.business_unit_id = filter.businessUnitId;
  if (filter.direction) where.direction = filter.direction;
  if (filter.category) where.category = filter.category;
  if (filter.quotationId) where.quotation_id = filter.quotationId;
  if (filter.purchaseOrderId) where.purchase_order_id = filter.purchaseOrderId;
  if (filter.dateFrom || filter.dateTo) {
    where.occurred_at = {
      ...(filter.dateFrom ? { [Op.gte]: filter.dateFrom } : {}),
      ...(filter.dateTo ? { [Op.lte]: filter.dateTo } : {}),
    };
  }

  const rows = await DataBase.instance.cash_movement.findAll({ where, order: [["occurred_at", "DESC"]] });

  return rows.map((row: CashMovementModel) => ({
    id: `manual-${row.id}`,
    source: "manual",
    source_id: row.id,
    direction: row.direction,
    category: row.category,
    amount: Number(row.amount),
    description: row.description,
    occurred_at: row.occurred_at,
    quotation_id: row.quotation_id,
    purchase_order_id: row.purchase_order_id,
    business_unit_id: row.business_unit_id,
    created_at: row.created_at.toISOString(),
  }));
};

const getQuotationPaymentMovements = async (filter: CashMovementListFilter): Promise<CashMovementListItem[]> => {
  // Los pagos son siempre un ingreso sin orden de compra asociada — si se
  // pide "egreso" o un purchase_order_id puntual, ningún pago puede
  // matchear, así que se ahorra la consulta.
  if (filter.direction === "expense" || filter.purchaseOrderId) return [];

  const rows = (await DataBase.instance.sequelize.query(
    `
      SELECT qp.id, qp.quotation_id, qp.amount, qp.method, qp.notes, qp.paid_at, qp.created_at,
             q.business_unit_id
      FROM quotation_payment qp
      INNER JOIN quotation q ON q.id = qp.quotation_id
      WHERE (:companyId IS NULL OR q.company_id = :companyId)
        AND (:businessUnitId IS NULL OR q.business_unit_id = :businessUnitId)
        AND (:quotationId IS NULL OR qp.quotation_id = :quotationId)
        AND (:dateFrom IS NULL OR qp.paid_at >= :dateFrom)
        AND (:dateTo IS NULL OR qp.paid_at <= :dateTo)
      ORDER BY qp.paid_at DESC
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        companyId: filter.companyId,
        businessUnitId: filter.businessUnitId ?? null,
        quotationId: filter.quotationId ?? null,
        dateFrom: filter.dateFrom ?? null,
        dateTo: filter.dateTo ?? null,
      },
    }
  )) as RawPaymentRow[];

  return rows.map((row) => ({
    id: `qp-${row.id}`,
    source: "quotation_payment",
    source_id: row.id,
    direction: "income",
    category: row.method,
    amount: Number(row.amount),
    description: row.notes,
    occurred_at: row.paid_at,
    quotation_id: row.quotation_id,
    purchase_order_id: null,
    business_unit_id: row.business_unit_id,
    created_at: new Date(row.created_at).toISOString(),
  }));
};

const getQuotationExpenseMovements = async (filter: CashMovementListFilter): Promise<CashMovementListItem[]> => {
  if (filter.direction === "income") return [];

  const rows = (await DataBase.instance.sequelize.query(
    `
      SELECT qe.id, qe.quotation_id, qe.amount, qe.category, qe.description, qe.spent_at, qe.created_at,
             q.business_unit_id, poip.purchase_order_id
      FROM quotation_expense qe
      INNER JOIN quotation q ON q.id = qe.quotation_id
      LEFT JOIN (
        SELECT pop.quotation_expense_id, poi.purchase_order_id
        FROM purchase_order_item_purchase pop
        INNER JOIN purchase_order_item poi ON poi.id = pop.purchase_order_item_id
      ) poip ON poip.quotation_expense_id = qe.id
      WHERE (:companyId IS NULL OR q.company_id = :companyId)
        AND (:businessUnitId IS NULL OR q.business_unit_id = :businessUnitId)
        AND (:quotationId IS NULL OR qe.quotation_id = :quotationId)
        AND (:purchaseOrderId IS NULL OR poip.purchase_order_id = :purchaseOrderId)
        AND (:category IS NULL OR qe.category = :category)
        AND (:dateFrom IS NULL OR qe.spent_at >= :dateFrom)
        AND (:dateTo IS NULL OR qe.spent_at <= :dateTo)
      ORDER BY qe.spent_at DESC
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        companyId: filter.companyId,
        businessUnitId: filter.businessUnitId ?? null,
        quotationId: filter.quotationId ?? null,
        purchaseOrderId: filter.purchaseOrderId ?? null,
        category: filter.category ?? null,
        dateFrom: filter.dateFrom ?? null,
        dateTo: filter.dateTo ?? null,
      },
    }
  )) as RawExpenseRow[];

  return rows.map((row) => ({
    id: `qe-${row.id}`,
    source: "quotation_expense",
    source_id: row.id,
    direction: "expense",
    category: row.category,
    amount: Number(row.amount),
    description: row.description,
    occurred_at: row.spent_at,
    quotation_id: row.quotation_id,
    purchase_order_id: row.purchase_order_id,
    business_unit_id: row.business_unit_id,
    created_at: new Date(row.created_at).toISOString(),
  }));
};

// Junta las 3 fuentes, ordena por fecha (y created_at como desempate) y
// pagina en memoria — volumen esperado de un libro de caja de una pyme,
// nunca millones de filas (CLAUDE.md sección 8: evitar sobre-ingeniería
// para una escala que no existe).
const getCashMovementsList = async (filter: CashMovementListFilter): Promise<PaginatedResult<CashMovementListItem>> => {
  const [manual, payments, expenses] = await Promise.all([
    getManualMovements(filter),
    getQuotationPaymentMovements(filter),
    getQuotationExpenseMovements(filter),
  ]);

  const merged = [...manual, ...payments, ...expenses].sort((a, b) => {
    if (a.occurred_at !== b.occurred_at) return a.occurred_at < b.occurred_at ? 1 : -1;
    return a.created_at < b.created_at ? 1 : -1;
  });

  const total = merged.length;
  const offset = (filter.page - 1) * filter.limit;
  const data = merged.slice(offset, offset + filter.limit);

  return { data, meta: buildPaginationMeta(total, filter.page, filter.limit) };
};

const getCashMovementById = async (id: number) => {
  return DataBase.instance.cash_movement.findOne({ where: { id } });
};

export { getCashMovementsList, getCashMovementById };
