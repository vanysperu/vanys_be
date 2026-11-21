import path from "path";
import { Response } from "express";
import { Worker } from "worker_threads";
import { AppError } from "../errors/AppError";
import { ExcelSheet } from "./excel_export.types";

// Tope de filas de un reporte: más que esto no se abre cómodo en Excel y
// conviene acotar el filtro (fechas, estado...). Se avisa con un 400 claro.
export const EXPORT_MAX_ROWS = 20_000;
const BUILD_TIMEOUT_MS = 60_000;
const WORKER_MEMORY_MB = 384;

export const assertExportSize = (total: number): void => {
  if (total <= EXPORT_MAX_ROWS) return;
  throw new AppError(
    400,
    `El reporte tiene ${total} filas (máximo ${EXPORT_MAX_ROWS}). Acota el filtro, por ejemplo por fechas.`,
    undefined,
    "EXPORT_TOO_LARGE"
  );
};

// En desarrollo (ts-node) el worker es .ts; compilado, el .js de al lado
// (mismo criterio que supplier_stock/services/shared/excel_reader.ts).
const workerFile = () => {
  const isTs = __filename.endsWith(".ts");
  return {
    file: path.join(__dirname, isTs ? "excel_export.worker.ts" : "excel_export.worker.js"),
    execArgv: isTs ? ["--require", "ts-node/register/transpile-only"] : undefined,
  };
};

// Arma el .xlsx en un worker_thread con límite de memoria y de tiempo.
export const buildXlsxBuffer = (sheets: ExcelSheet[]): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const { file, execArgv } = workerFile();
    const worker = new Worker(file, {
      workerData: { sheets },
      resourceLimits: { maxOldGenerationSizeMb: WORKER_MEMORY_MB },
      execArgv,
    });
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      action();
    };
    const fail = (message: string) => finish(() => reject(new AppError(500, message, undefined, "EXPORT_FAILED")));
    const timer = setTimeout(() => fail("El reporte tardó demasiado en armarse"), BUILD_TIMEOUT_MS);

    worker.once("message", (message: { bytes?: Uint8Array; error?: string }) => {
      if (!message.bytes) return fail(message.error ?? "No se pudo armar el Excel");
      const bytes = message.bytes;
      finish(() => resolve(Buffer.from(bytes)));
    });
    worker.once("error", (error: Error) => fail(`No se pudo armar el Excel: ${error.message}`));
    worker.once("exit", (code) => fail(`El armado del Excel se cortó (código ${code})`));
  });

// Responde el archivo para descargar (no JSON). Privado: no se cachea.
export const sendXlsx = async (res: Response, fileName: string, sheets: ExcelSheet[]): Promise<void> => {
  const buffer = await buildXlsxBuffer(sheets);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(buffer);
};
