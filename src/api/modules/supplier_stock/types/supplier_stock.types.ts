import type { ColumnMap, ImportTrigger, SourceStatus, SourceType } from "../model/supplier_stock.models";
import type { ParsedStockRow } from "../services/shared/stock_parsing";

// Fuente tal como sale hacia el frontend: el enlace NUNCA sale en claro (puede
// traer un token del proveedor); solo el dominio, para reconocerlo.
export interface StockSourceDto {
  id: number;
  company_id: number;
  supplier_id: number;
  supplierName: string | null;
  name: string;
  source_type: SourceType;
  hasUrl: boolean;
  urlHost: string | null;
  sheet_name: string | null;
  header_row: number;
  column_map: ColumnMap;
  refresh_minutes: number;
  last_status: SourceStatus;
  last_error: string | null;
  lastSuccessAt: { date: string; time: string } | null;
  // Filas de la última lectura buena.
  itemCount: number;
  active: boolean;
}

export interface StockSourceInput {
  supplier_id: number;
  name: string;
  source_type: SourceType;
  // Solo al crear o cambiar el enlace; vacío al editar = se conserva.
  url?: string | null;
  sheet_name?: string | null;
  header_row: number;
  column_map: ColumnMap;
  refresh_minutes: number;
}

export interface StockPreviewInput {
  url?: string | null;
  // Fuente ya guardada: se usa su enlace (sin tener que volver a escribirlo).
  sourceId?: number | null;
  sheet_name?: string | null;
  header_row: number;
  column_map?: ColumnMap | null;
}

export interface StockPreviewDto {
  sheets: string[];
  sheetName: string;
  headers: string[];
  // Primeras filas tal cual vienen (para elegir las columnas).
  sampleRows: unknown[][];
  totalRows: number;
  // Cómo se leyeron con el mapeo indicado (si es válido).
  parsed: ParsedStockRow[];
  parsedCount: number;
  mappingError: string | null;
}

export interface StockImportDto {
  id: number;
  trigger_type: ImportTrigger;
  status: "running" | "ok" | "error";
  rows_read: number;
  rows_valid: number;
  error: string | null;
  startedAt: { date: string; time: string };
  finishedAt: { date: string; time: string } | null;
}

// Stock de un producto en una fuente (para Nueva cotización).
export interface ProductSourceStock {
  sourceId: number;
  sourceName: string;
  supplierName: string | null;
  quantity: number;
  // Hay filas cuya cantidad no se pudo leer ("Consultar"): se muestra el texto.
  quantityTexts: string[];
  // Por color del producto (códigos vinculados a un color).
  byColor: { color: string; quantity: number }[];
  updatedAt: { date: string; time: string } | null;
  stale: boolean;
}

export interface ProductStockLookup {
  productId: number;
  sources: ProductSourceStock[];
  total: number;
}

export interface StockSearchRow {
  code: string;
  description: string | null;
  products: { id: number; name: string }[];
  bySource: { sourceId: number; quantity: number | null; quantityText: string | null }[];
  total: number;
}
