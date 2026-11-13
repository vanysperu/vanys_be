import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { openSecret } from "../../../../../core/security/secretBox";
import { readWorkbookRows } from "../shared/excel_reader";
import { downloadStockFile } from "../shared/safe_download";
import { ColumnMapError, mapStockRows, resolveColumns } from "../shared/stock_parsing";
import { findSourceForCaller } from "../shared/source_shared";
import type { StockPreviewDto, StockPreviewInput } from "../../types/supplier_stock.types";

const SAMPLE_ROWS = 8;
const PARSED_ROWS = 20;

// "Probar fuente" (plan §7): descarga (o lee el archivo subido) y muestra las
// hojas, el encabezado, las primeras filas y cómo se leería cada columna con
// el mapeo indicado, ANTES de guardar. No guarda nada.
export const previewSourceService = async (input: StockPreviewInput, user: IToken, upload?: Buffer): Promise<StockPreviewDto> => {
  const buffer = upload ?? (await resolvePreviewFile(input, user));
  const { sheets, sheetName, rows } = await readWorkbookRows(buffer, input.sheet_name ?? null);
  const header = rows[input.header_row - 1] ?? [];
  const data = rows.slice(input.header_row);

  let parsed: StockPreviewDto["parsed"] = [];
  let parsedCount = 0;
  let mappingError: string | null = null;
  if (input.column_map) {
    try {
      const all = mapStockRows(data, resolveColumns(header, input.column_map));
      parsed = all.slice(0, PARSED_ROWS);
      parsedCount = all.length;
    } catch (error: unknown) {
      if (!(error instanceof ColumnMapError)) throw error;
      mappingError = error.message;
    }
  }

  return {
    sheets,
    sheetName,
    headers: header.map((cell) => String(cell ?? "").trim()),
    sampleRows: data.slice(0, SAMPLE_ROWS),
    totalRows: data.length,
    parsed,
    parsedCount,
    mappingError,
  };
};

const resolvePreviewFile = async (input: StockPreviewInput, user: IToken): Promise<Buffer> => {
  const url = input.url?.trim();
  if (url) return (await downloadStockFile(url)).buffer;
  if (!input.sourceId) throw new AppError(400, "Pega el enlace o sube el archivo para probar");

  const source = await findSourceForCaller(input.sourceId, user);
  if (!source.url_encrypted) throw new AppError(400, "Esta fuente no tiene enlace: sube el archivo para probar");
  return (await downloadStockFile(openSecret(source.url_encrypted))).buffer;
};
