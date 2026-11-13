import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { cancelDocumentService } from "../services/documents/cancel_document.service";

// POST /api/inventory/documents/:id/cancel { reason }
export const cancelDocumentController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await cancelDocumentService(Number(req.params.id), String(req.body.reason), req.user as IToken), "Documento anulado");
});
