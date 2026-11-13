import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { refreshSourceService } from "../services/import/refresh_source.service";

// POST /api/supplier-stock/sources/:id/refresh — "Actualizar ahora" (enlace) o,
// con un archivo en multipart, leer ese archivo.
export const refreshSourceController = asyncHandler(async (req: Request, res: Response) => {
  const source = await refreshSourceService(Number(req.params.id), req.user as IToken, req.file?.buffer);
  ok(res, 200, source, `Stock actualizado: ${source.itemCount} filas`);
});
