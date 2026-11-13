import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { updateDocumentService } from "../services/documents/update_document.service";
import type { DocumentInput } from "../types/inventory.types";

// PUT /api/inventory/documents/:id — solo borrador
export const updateDocumentController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await updateDocumentService(Number(req.params.id), req.body as DocumentInput, req.user as IToken), "Borrador actualizado");
});
