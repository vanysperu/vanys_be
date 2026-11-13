import { parentPort, workerData } from "worker_threads";
import * as XLSX from "xlsx";

// Lee un Excel/CSV en un hilo aparte (CLAUDE.md §8: nada pesado en el hilo
// principal). Con límite de filas: un archivo enorme o "inflado" no se lee
// completo. Devuelve las hojas y las filas como matrices de valores crudos.
interface WorkerInput {
  buffer: Uint8Array;
  sheetName: string | null;
  maxRows: number;
}

const run = () => {
  const { buffer, sheetName, maxRows } = workerData as WorkerInput;
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    dense: true,
    sheetRows: maxRows,
    // CSV/texto: sin interpretar números ("1.500" sería 1,5); la cantidad la
    // interpreta parseQuantity con las reglas del stock. No afecta a .xlsx.
    raw: true,
    cellFormula: false,
    cellHTML: false,
    cellStyles: false,
  });
  const sheets = workbook.SheetNames;
  const name = sheetName?.trim() || sheets[0];
  const sheet = name ? workbook.Sheets[name] : undefined;
  if (!sheet) {
    parentPort?.postMessage({ error: `No existe la hoja "${sheetName ?? ""}". Hojas del archivo: ${sheets.join(", ")}`, sheets });
    return;
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  parentPort?.postMessage({ sheets, sheetName: name, rows });
};

try {
  run();
} catch (error: unknown) {
  parentPort?.postMessage({ error: error instanceof Error ? `No se pudo leer el archivo: ${error.message}` : "No se pudo leer el archivo" });
}
