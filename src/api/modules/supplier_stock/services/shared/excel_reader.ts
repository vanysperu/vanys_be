import path from "path";
import { Worker } from "worker_threads";
import { AppError } from "../../../../../core/errors/AppError";

// Topes de lectura (plan §7): más filas que esto no es un stock razonable, y
// así un archivo malicioso no agota la memoria ni traba el servidor.
const MAX_ROWS = 60_000;
const READ_TIMEOUT_MS = 60_000;
const WORKER_MEMORY_MB = 384;

export interface WorkbookRows {
  sheets: string[];
  sheetName: string;
  rows: unknown[][];
}

interface WorkerMessage {
  error?: string;
  sheets?: string[];
  sheetName?: string;
  rows?: unknown[][];
}

// En desarrollo (ts-node) el worker es .ts y se carga con ts-node; compilado,
// es el .js de al lado.
const workerFile = () => {
  const isTs = __filename.endsWith(".ts");
  return {
    file: path.join(__dirname, isTs ? "excel.worker.ts" : "excel.worker.js"),
    execArgv: isTs ? ["--require", "ts-node/register/transpile-only"] : undefined,
  };
};

// Lee el archivo en un worker_thread con límite de memoria y de tiempo.
export const readWorkbookRows = (buffer: Buffer, sheetName: string | null): Promise<WorkbookRows> =>
  new Promise((resolve, reject) => {
    const { file, execArgv } = workerFile();
    const worker = new Worker(file, {
      workerData: { buffer: new Uint8Array(buffer), sheetName, maxRows: MAX_ROWS },
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
    const timer = setTimeout(
      () => finish(() => reject(new AppError(422, "El archivo tardó demasiado en leerse", undefined, "STOCK_FILE_TIMEOUT"))),
      READ_TIMEOUT_MS
    );

    worker.once("message", (message: WorkerMessage) =>
      finish(() => {
        if (message.error || !message.rows || !message.sheetName) {
          reject(new AppError(422, message.error ?? "No se pudo leer el archivo", { sheets: message.sheets ?? [] }, "STOCK_FILE_UNREADABLE"));
          return;
        }
        resolve({ sheets: message.sheets ?? [], sheetName: message.sheetName, rows: message.rows });
      })
    );
    worker.once("error", (error: Error) =>
      finish(() => reject(new AppError(422, `No se pudo leer el archivo: ${error.message}`, undefined, "STOCK_FILE_UNREADABLE")))
    );
    worker.once("exit", (code) =>
      finish(() => reject(new AppError(422, `La lectura del archivo se cortó (código ${code})`, undefined, "STOCK_FILE_UNREADABLE")))
    );
  });
