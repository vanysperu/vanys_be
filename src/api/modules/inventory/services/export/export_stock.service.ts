import { IToken } from "../../../../interfaces/IToken.interface";
import { assertExportSize, EXPORT_MAX_ROWS } from "../../../../../core/excel/excel_export";
import { ExcelColumn, ExcelSheet } from "../../../../../core/excel/excel_export.types";
import { listStockService } from "../stock/list_stock.service";

export interface StockExportFilters {
  companyId: number;
  warehouseId?: number;
  searchTerm?: string;
  includeZero?: boolean;
}

/**
 * Stock de inventario en Excel (pedido del usuario, 21-nov): una fila por
 * producto y color, una columna por almacén y el total — lo mismo de la
 * pantalla de Inventario, con sus filtros. El costo promedio sale solo si el
 * usuario puede ver costos (lo decide el service del listado).
 */
export async function exportStockService(filters: StockExportFilters, user: IToken): Promise<ExcelSheet> {
  const result = await listStockService({ ...filters, page: 1, limit: EXPORT_MAX_ROWS }, user);
  assertExportSize(result.meta.total);

  // Almacenes en el orden en que aparecen (los mismos para todas las filas).
  const warehouses = new Map<number, string>();
  result.data.forEach((row) => row.byWarehouse.forEach((cell) => warehouses.set(cell.warehouseId, cell.warehouseName)));
  const warehouseIds = [...warehouses.keys()];
  const showCost = result.data.some((row) => row.avgCost !== null);

  const columns: ExcelColumn[] = [
    { header: "Producto", width: 36 },
    { header: "SKU", width: 14 },
    { header: "Color", width: 16 },
    ...warehouseIds.map((id): ExcelColumn => ({ header: warehouses.get(id) ?? `Almacén ${id}`, type: "number", width: 14 })),
    { header: "Total", type: "number" },
    ...(showCost ? [{ header: "Costo promedio", type: "money", width: 15 } as ExcelColumn] : []),
  ];

  const rows = result.data.map((row) => [
    row.productName,
    row.sku ?? "",
    row.color,
    ...warehouseIds.map((id) => row.byWarehouse.find((cell) => cell.warehouseId === id)?.quantity ?? 0),
    row.total,
    ...(showCost ? [row.avgCost] : []),
  ]);

  return { name: "Stock", columns, rows };
}
