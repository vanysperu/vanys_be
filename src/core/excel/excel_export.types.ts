// Reportes en Excel (pedido del usuario, 21-nov): cada listado se descarga
// con los mismos filtros que en pantalla. Tipos compartidos entre el hilo
// principal y el worker que arma el archivo.

export type ExcelCellValue = string | number | boolean | null;

// money = número con 2 decimales y separador de miles; date/time ya llegan
// como texto ("21/11/2026", "13:05"), separados (regla de fechas del proyecto).
export type ExcelColumnType = "text" | "money" | "number";

export interface ExcelColumn {
  header: string;
  type?: ExcelColumnType;
  // Ancho en caracteres (opcional).
  width?: number;
}

export interface ExcelSheet {
  name: string;
  columns: ExcelColumn[];
  rows: ExcelCellValue[][];
  // Filas extra al final (ej. "Total"), con el mismo formato de columnas.
  footer?: ExcelCellValue[][];
}
