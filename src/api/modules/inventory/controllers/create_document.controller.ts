import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveCompanyForInventory } from "../services/shared/inventory_company";
import { createDocumentService } from "../services/documents/create_document.service";
import type { DocumentInput } from "../types/inventory.types";

// POST /api/inventory/documents — borrador
export const createDocumentController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveCompanyForInventory(user, req.body.company_id);
  ok(res, 201, await createDocumentService(companyId, req.body as DocumentInput, user), "Documento guardado como borrador");
});
