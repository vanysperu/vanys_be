import { col, fn, Op, WhereOptions } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildBusinessDateRange } from "../../../../../core/utils/listFilters";
import { QuotationAttributes, QuotationModel, QuotationStatus } from "../../model/quotation.model";

// Columnas del tablero: la cadena principal del flujo (espejo de
// QUOTATION_MAIN_CHAIN en grulla_fe: quotation.types.ts). Rechazada, vencida y
// cancelada no son columnas: se ven en la vista de lista.
export const BOARD_STATUSES: QuotationStatus[] = [
  "quote_requested",
  "pending",
  "accepted",
  "design_pending",
  "in_process",
  "ready",
  "delivered",
  "finished",
];

export const BOARD_DEFAULT_PER_STATUS = 20;
export const BOARD_MAX_PER_STATUS = 50;

export interface QuotationBoardFilter {
  // null = todas las empresas (solo el Super Administrador).
  companyId: number | null;
  businessUnitId?: number;
  clientId?: number;
  // Rango de fecha de emisión (días de Lima, YYYY-MM-DD).
  dateFrom?: unknown;
  dateTo?: unknown;
  perStatus: number;
}

export interface QuotationBoardColumn {
  status: QuotationStatus;
  // Totales de TODA la columna (no solo de lo que se manda).
  total_count: number;
  total_amount: number;
  data: QuotationModel[];
}

interface ColumnTotalsRow {
  status: QuotationStatus;
  total_count: string | number;
  total_amount: string | number;
}

// Mismos filtros que el listado (getQuotationsList). Arreglo + Op.and en vez
// de un objeto con spreads condicionales (ver testing-gotchas: TypeScript se
// vuelve lentísimo con muchos spreads en un `where`).
const scopeConditions = (filter: QuotationBoardFilter): WhereOptions<QuotationAttributes>[] => {
  const conditions: WhereOptions<QuotationAttributes>[] = [];
  if (filter.companyId !== null) conditions.push({ company_id: filter.companyId });
  if (filter.businessUnitId !== undefined) conditions.push({ business_unit_id: filter.businessUnitId });
  if (filter.clientId !== undefined) conditions.push({ client_id: filter.clientId });
  const createdAt = buildBusinessDateRange(filter.dateFrom, filter.dateTo);
  if (createdAt) conditions.push({ created_at: createdAt });
  return conditions;
};

/**
 * Tablero de cotizaciones en UNA llamada (pedido explícito del usuario: "cuando
 * paso una cotización del carrito a Pendiente no se lista"). Antes la pantalla
 * pedía las 100 más nuevas de TODOS los estados y las repartía: una columna
 * quedaba incompleta y sus totales eran solo de lo cargado. Ahora cada columna
 * trae sus primeras `perStatus`, de la que cambió de estado más recientemente
 * a la más antigua, más su cantidad y monto reales. "Ver más" en una columna
 * usa el listado normal (GET /quotation/list?status=...).
 *
 * Son 8 consultas fijas (una por columna, cada una por el índice empresa +
 * estado + status_changed_at) más una de totales, en paralelo: no crecen con
 * los datos.
 */
export async function getQuotationBoard(filter: QuotationBoardFilter): Promise<{ columns: QuotationBoardColumn[] }> {
  const conditions = scopeConditions(filter);

  const [totalsRows, ...pages] = await Promise.all([
    DataBase.instance.quotation.findAll({
      attributes: [
        "status",
        [fn("COUNT", col("id")), "total_count"],
        [fn("COALESCE", fn("SUM", col("total")), 0), "total_amount"],
      ],
      where: { [Op.and]: [...conditions, { status: { [Op.in]: BOARD_STATUSES } }] },
      group: ["status"],
      raw: true,
    }) as unknown as Promise<ColumnTotalsRow[]>,
    ...BOARD_STATUSES.map((status) =>
      DataBase.instance.quotation.findAll({
        where: { [Op.and]: [...conditions, { status }] },
        order: [
          ["status_changed_at", "DESC"],
          ["id", "DESC"],
        ],
        limit: filter.perStatus,
        include: [{ association: "client", attributes: ["id", "name"] }],
      })
    ),
  ]);

  const totalsByStatus = new Map(totalsRows.map((row) => [row.status, row]));
  return {
    columns: BOARD_STATUSES.map((status, index) => {
      const totals = totalsByStatus.get(status);
      return {
        status,
        total_count: Number(totals?.total_count ?? 0),
        total_amount: Number(totals?.total_amount ?? 0),
        data: pages[index] ?? [],
      };
    }),
  };
}
