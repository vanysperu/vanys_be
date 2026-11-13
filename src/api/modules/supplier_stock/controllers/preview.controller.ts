import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { previewSourceService } from "../services/import/preview.service";
import type { StockPreviewInput } from "../types/supplier_stock.types";

// POST /api/supplier-stock/preview — "Probar fuente": JSON con el enlace (o la
// fuente guardada) o multipart con el archivo. No guarda nada.
export const previewSourceController = asyncHandler(async (req: Request, res: Response) => {
  const input: StockPreviewInput = {
    url: req.body.url ?? null,
    sourceId: req.body.sourceId ? Number(req.body.sourceId) : null,
    sheet_name: req.body.sheet_name ?? null,
    header_row: Number(req.body.header_row),
    column_map: req.body.column_map ?? null,
  };
  const preview = await previewSourceService(input, req.user as IToken, req.file?.buffer);
  ok(res, 200, preview);
});
