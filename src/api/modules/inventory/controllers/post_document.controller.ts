import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { postDocumentService } from "../services/documents/post_document.service";

// POST /api/inventory/documents/:id/post — confirmar (mueve el stock)
export const postDocumentController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await postDocumentService(Number(req.params.id), req.user as IToken), "Documento confirmado");
});
