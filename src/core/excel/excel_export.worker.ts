import { parentPort, workerData } from "worker_threads";
import * as XLSX from "xlsx";
import { ExcelSheet } from "./excel_export.types";

// Arma el .xlsx en un hilo aparte (CLAUDE.md §8: nada pesado en el hilo
// principal). Recibe las hojas ya con valores simples y devuelve los bytes.
const MONEY_FORMAT = "#,##0.00";

// Nombre de hoja válido para Excel: sin []:*?/\ y máximo 31 caracteres.
const FORBIDDEN_SHEET_CHARS = new Set(["[", "]", ":", "*", "?", "/", "\\"]);
const safeSheetName = (name: string): string =>
  [...name].map((char) => (FORBIDDEN_SHEET_CHARS.has(char) ? " " : char)).join("").slice(0, 31) || "Hoja";

const buildSheet = (sheet: ExcelSheet): XLSX.WorkSheet => {
  const body = [...sheet.rows, ...(sheet.footer ?? [])];
  const worksheet = XLSX.utils.aoa_to_sheet([sheet.columns.map((column) => column.header), ...body]);
  worksheet["!cols"] = sheet.columns.map((column) => ({ wch: column.width ?? Math.max(12, column.header.length + 2) }));
  // Formato de dinero en las columnas "money" (la celda sigue siendo número).
  sheet.columns.forEach((column, columnIndex) => {
    if (column.type !== "money") return;
    body.forEach((_row, rowIndex) => {
      const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex + 1, c: columnIndex })] as XLSX.CellObject | undefined;
      if (cell?.t === "n") cell.z = MONEY_FORMAT;
    });
  });
  return worksheet;
};

const run = () => {
  const { sheets } = workerData as { sheets: ExcelSheet[] };
  const workbook = XLSX.utils.book_new();
  sheets.forEach((sheet) => XLSX.utils.book_append_sheet(workbook, buildSheet(sheet), safeSheetName(sheet.name)));
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
  parentPort?.postMessage({ bytes: new Uint8Array(bytes) });
};

try {
  run();
} catch (error: unknown) {
  parentPort?.postMessage({ error: error instanceof Error ? error.message : "No se pudo armar el Excel" });
}
