import crypto from "crypto";
import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { openSecret } from "../../../../../core/security/secretBox";
import { nowUtc } from "../../../../../utils/dateUtils";
import type { ImportTrigger, SupplierStockSourceModel } from "../../model/supplier_stock.models";
import { readWorkbookRows } from "../shared/excel_reader";
import { downloadStockFile } from "../shared/safe_download";
import { ColumnMapError, mapStockRows, resolveColumns, type ParsedStockRow } from "../shared/stock_parsing";

// Una lectura que lleva más de esto "corriendo" se considera colgada (el
// proceso se reinició a mitad): se puede volver a lanzar.
const STALE_RUNNING_MS = 15 * 60 * 1000;
const INSERT_CHUNK = 1000;
const ERROR_MAX = 500;

export const isImportRunning = (source: SupplierStockSourceModel): boolean =>
  source.last_status === "running" && Date.now() - new Date(source.updated_at ?? source.created_at).getTime() < STALE_RUNNING_MS;

// Filas del archivo -> filas de stock con el mapeo de la fuente.
export const parseStockFile = async (buffer: Buffer, source: Pick<SupplierStockSourceModel, "sheet_name" | "header_row" | "column_map">) => {
  const { rows } = await readWorkbookRows(buffer, source.sheet_name);
  const header = rows[source.header_row - 1] ?? [];
  const data = rows.slice(source.header_row);
  try {
    const columns = resolveColumns(header, source.column_map);
    return { rowsRead: data.length, parsed: mapStockRows(data, columns) };
  } catch (error: unknown) {
    if (error instanceof ColumnMapError) throw new AppError(422, error.message, undefined, "STOCK_COLUMN_MAP");
    throw error;
  }
};

// Reemplazo atómico (plan §7): las filas nuevas entran con su import_id y
// recién al final, en la misma transacción, la fuente apunta a esa lectura y
// se borran las anteriores. Si algo falla, queda la última lectura buena.
const saveImportedRows = async (source: SupplierStockSourceModel, importId: number, parsed: ParsedStockRow[], actorId: number | null) => {
  const now = nowUtc();
  await DataBase.instance.sequelize.transaction(async (transaction) => {
    for (let start = 0; start < parsed.length; start += INSERT_CHUNK) {
      const chunk = parsed.slice(start, start + INSERT_CHUNK);
      await DataBase.instance.supplier_stock_item.bulkCreate(
        chunk.map((row) => ({
          id: 0,
          company_id: source.company_id,
          source_id: source.id,
          import_id: importId,
          code_raw: row.codeRaw,
          code_norm: row.codeNorm,
          color: row.color,
          description: row.description,
          quantity: row.quantity,
          quantity_text: row.quantityText,
          price: row.price,
          created_by: actorId,
          created_at: now,
          updated_by: actorId,
          updated_at: now,
        })),
        { transaction }
      );
    }
    await DataBase.instance.supplier_stock_item.destroy({
      where: { source_id: source.id, import_id: { [Op.ne]: importId } },
      transaction,
    });
    await source.update(
      { last_import_id: importId, last_success_at: now, last_status: "ok", last_error: null, updated_by: actorId, updated_at: now },
      { transaction }
    );
  });
};

interface RunImportOptions {
  source: SupplierStockSourceModel;
  trigger: ImportTrigger;
  actorId: number | null;
  // Archivo subido a mano; sin él se descarga del enlace de la fuente.
  buffer?: Buffer;
}

// Lee la fuente y deja su resultado en el historial. Devuelve la lectura; si
// falla, la deja con su error y vuelve a lanzar el error (el llamador decide
// si responderlo o solo registrarlo, como el job).
export const runSourceImport = async ({ source, trigger, actorId, buffer }: RunImportOptions) => {
  if (isImportRunning(source)) throw new AppError(409, "Esta fuente ya se está actualizando", undefined, "STOCK_IMPORT_RUNNING");

  const startedAt = nowUtc();
  const record = await DataBase.instance.supplier_stock_import.create({
    id: 0,
    company_id: source.company_id,
    source_id: source.id,
    trigger_type: trigger,
    started_at: startedAt,
    finished_at: null,
    status: "running",
    rows_read: 0,
    rows_valid: 0,
    file_sha256: null,
    error: null,
    created_by: actorId,
    created_at: startedAt,
    updated_by: actorId,
    updated_at: startedAt,
  });
  await source.update({ last_status: "running", updated_at: startedAt });

  try {
    const file = buffer ?? (await downloadFromSource(source)).buffer;
    const { rowsRead, parsed } = await parseStockFile(file, source);
    if (parsed.length === 0) {
      throw new AppError(422, "No encontré filas con código: revisa la hoja, la fila de encabezado y la columna de código", undefined, "STOCK_EMPTY");
    }
    await saveImportedRows(source, Number(record.id), parsed, actorId);
    const finishedAt = nowUtc();
    await record.update({
      status: "ok",
      finished_at: finishedAt,
      rows_read: rowsRead,
      rows_valid: parsed.length,
      file_sha256: crypto.createHash("sha256").update(file).digest("hex"),
      updated_at: finishedAt,
    });
    return record;
  } catch (error: unknown) {
    const message = (error instanceof Error ? error.message : "Error desconocido").slice(0, ERROR_MAX);
    const finishedAt = nowUtc();
    await record.update({ status: "error", finished_at: finishedAt, error: message, updated_at: finishedAt });
    await source.update({ last_status: "error", last_error: message, updated_at: finishedAt });
    throw error;
  }
};

const downloadFromSource = async (source: SupplierStockSourceModel) => {
  if (source.source_type !== "url" || !source.url_encrypted) {
    throw new AppError(400, "Esta fuente se actualiza subiendo el archivo", undefined, "STOCK_SOURCE_IS_UPLOAD");
  }
  return downloadStockFile(openSecret(source.url_encrypted));
};
