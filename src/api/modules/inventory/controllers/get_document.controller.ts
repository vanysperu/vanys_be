import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getDocumentService } from "../services/documents/get_document.service";

// GET /api/inventory/documents/:id
export const getDocumentController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await getDocumentService(Number(req.params.id), req.user as IToken));
});
