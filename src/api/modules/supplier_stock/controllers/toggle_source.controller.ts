import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { toggleSourceService } from "../services/sources/toggle_source.service";

// PUT /api/supplier-stock/sources/:id/disable — deshabilita o vuelve a habilitar.
export const toggleSourceController = asyncHandler(async (req: Request, res: Response) => {
  const source = await toggleSourceService(Number(req.params.id), req.user as IToken);
  ok(res, 200, source, source.active ? "Fuente habilitada" : "Fuente deshabilitada");
});
