import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getQuotationResetPreview } from "../services/reset/preview.service";

// GET /quotation/:id/reset-preview — solo Super Administrador (requireSystemRole
// en la ruta), que ve todas las empresas: no hace falta validar alcance.
export const quotationResetPreviewController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await getQuotationResetPreview(Number(req.params.id)), "Vista previa del reset obtenida correctamente");
});
