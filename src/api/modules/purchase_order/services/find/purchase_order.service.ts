import { FindAndCountOptions, Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { PurchaseOrderAttributes, PurchaseOrderModel } from "../../model/purchase_order.model";
import { PurchaseOrderItemAttributes } from "../../model/purchase_order_item.model";
import { loadPurchasesByItemIds, PurchaseListItem } from "./purchase_order_item_purchase.service";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import { buildBusinessDateRange } from "../../../../../core/utils/listFilters";

const ACTOR_ATTRIBUTES = ["id", "name", "paternal_lastname"];

// Orden ya serializada, con cada item y sus compras (anuladas incluidas,
// con is_deleted y corrections_count). El `include` de items no se refleja
// en el tipo de toJSON() (limitación de Sequelize): se tipa acá.
type PurchaseOrderItemJson = PurchaseOrderItemAttributes & Record<string, unknown>;
export type PurchaseOrderWithItems = PurchaseOrderAttributes &
  Record<string, unknown> & { items: (PurchaseOrderItemJson & { purchases: PurchaseListItem[] })[] };

// Las compras de todos los items de las órdenes en UNA consulta (nunca una
// por item) — reemplaza el include "purchases", que no traía el gasto, la
// deuda ni las correcciones.
const withPurchases = async (orders: PurchaseOrderModel[]): Promise<PurchaseOrderWithItems[]> => {
  const plainOrders = orders.map(
    (order) => order.toJSON() as unknown as PurchaseOrderAttributes & Record<string, unknown> & { items?: PurchaseOrderItemJson[] }
  );
  const itemIds = plainOrders.flatMap((order) => (order.items ?? []).map((item) => Number(item.id)));
  const purchasesByItem = await loadPurchasesByItemIds(itemIds);

  return plainOrders.map((order) => ({
    ...order,
    items: (order.items ?? []).map((item) => ({ ...item, purchases: purchasesByItem.get(Number(item.id)) ?? [] })),
  }));
};

export interface PurchaseOrderListFilter {
  companyId?: number | null;
  // Tienda a la que se limita al caller (ver core/rbac/businessUnitScope.ts).
  // La orden de compra no tiene columna propia de tienda: hereda la de su
  // cotización, así que el filtro va sobre el include "quotation".
  businessUnitId?: number;
  assignedTo?: number;
  status?: string;
  // Filtros por columna (buscador de la tabla): clientName/assigneeName
  // buscan LIKE sobre las asociaciones, no sobre purchase_order directo.
  clientName?: string;
  assigneeName?: string;
  quotationId?: number;
  // Rango de fecha de creación (días de Lima, YYYY-MM-DD).
  dateFrom?: unknown;
  dateTo?: unknown;
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
}

// `assignedTo` es lo que alimenta el widget "Mis órdenes de compra" del
// Inicio (ver conversación) — cualquier usuario puede consultar SUS
// propias órdenes sin necesitar el módulo completo de compras.
const getPurchaseOrdersList = async ({
  companyId,
  businessUnitId,
  assignedTo,
  status,
  clientName,
  assigneeName,
  quotationId,
  dateFrom,
  dateTo,
  page,
  limit,
  orderBy,
  orderDir,
}: PurchaseOrderListFilter): Promise<PaginatedResult<PurchaseOrderAttributes>> => {
  const where: WhereOptions<PurchaseOrderAttributes> = {};
  if (companyId !== null && companyId !== undefined) where.company_id = companyId;
  if (assignedTo) where.assigned_to = assignedTo;
  if (status) where.status = status;
  if (quotationId) where.quotation_id = quotationId;
  // Rango de fecha de creación de la orden (días de Lima).
  const createdAt = buildBusinessDateRange(dateFrom, dateTo);
  if (createdAt) where.created_at = createdAt;

  // Ordenar por columnas propias de purchase_order (id, status, created_at,
  // assigned_to); ordenar por asociaciones (cliente/asignado) requeriría un
  // `order` de Sequelize sobre el include, no soportado por ahora.
  const sortableOwnColumns = new Set(["id", "status", "created_at", "assigned_to", "quotation_id"]);
  const resolvedOrderBy = sortableOwnColumns.has(orderBy) ? orderBy : "created_at";

  const queryOptions: FindAndCountOptions<PurchaseOrderAttributes> = {
    where,
    order: [[resolvedOrderBy, orderDir]],
    limit,
    offset: getOffset(page, limit),
    // required:true en los includes filtrados: si se busca por cliente/
    // asignado, solo deben contar las órdenes que matchean (inner join).
    include: [
      {
        association: "quotation",
        // client_id explícito: cuando este include pasa a required:true (filtro
        // de tienda o de cliente activo), Sequelize arma un subquery para la
        // paginación y necesita el FK del include anidado "client" ya presente
        // en los attributes seleccionados, si no lo agrega solo (a diferencia
        // del caso left join, donde sí lo resuelve automático).
        attributes: ["id", "status", "business_unit_id", "client_id"],
        required: Boolean(clientName) || businessUnitId !== undefined,
        where: businessUnitId !== undefined ? { business_unit_id: businessUnitId } : undefined,
        include: [
          {
            association: "client",
            attributes: ["id", "name"],
            required: Boolean(clientName),
            where: clientName ? { name: { [Op.like]: `%${clientName}%` } } : undefined,
          },
        ],
      },
      {
        association: "assignee",
        attributes: ACTOR_ATTRIBUTES,
        required: Boolean(assigneeName),
        where: assigneeName
          ? {
              [Op.or]: [
                { name: { [Op.like]: `%${assigneeName}%` } },
                { paternal_lastname: { [Op.like]: `%${assigneeName}%` } },
              ],
            }
          : undefined,
      },
      {
        association: "items",
        include: [
          { association: "quotationItem", include: [{ association: "product", attributes: ["id", "name"] }] },
        ],
      },
    ],
    // Con includes required:true sobre asociaciones hasMany/belongsTo del
    // lado "uno", findAndCountAll cuenta filas duplicadas si no se agrega
    // distinct — acá no aplica (client/assignee son belongsTo, 1 a 1), pero
    // se deja explícito por claridad de intención.
    distinct: true,
  };

  const { count, rows } = await DataBase.instance.purchase_order.findAndCountAll(queryOptions);
  return { data: await withPurchases(rows), meta: buildPaginationMeta(count, page, limit) };
};

const getPurchaseOrderById = async (id: number): Promise<PurchaseOrderWithItems | null> => {
  const purchaseOrder = await DataBase.instance.purchase_order.findOne({
    where: { id },
    include: [
      { association: "quotation", attributes: ["id", "status", "company_id", "business_unit_id"] },
      { association: "assignee", attributes: ACTOR_ATTRIBUTES },
      { association: "creator", attributes: ACTOR_ATTRIBUTES },
      {
        association: "items",
        include: [
          { association: "quotationItem", include: [{ association: "product", attributes: ["id", "name"] }] },
        ],
      },
    ],
  });
  if (!purchaseOrder) return null;
  const [withItems] = await withPurchases([purchaseOrder]);
  return withItems ?? null;
};

export { getPurchaseOrdersList, getPurchaseOrderById };
