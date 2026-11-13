import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveCompanyForInventory } from "../services/shared/inventory_company";
import { listDocumentsService } from "../services/documents/list_documents.service";
import type { DocStatus, DocType } from "../model/inventory.models";

// GET /api/inventory/documents
export const listDocumentsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveCompanyForInventory(user, req.query.companyId);
  const { page, limit } = parsePaginationParams(req.query);
  const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);
  const result = await listDocumentsService(
    {
      companyId,
      page,
      limit,
      docType: text(req.query.docType) as DocType | undefined,
      status: text(req.query.status) as DocStatus | undefined,
      warehouseId: Number(req.query.warehouseId) || undefined,
      dateFrom: text(req.query.dateFrom),
      dateTo: text(req.query.dateTo),
    },
    user
  );
  ok(res, 200, result);
});
