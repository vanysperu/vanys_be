import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { listImportsService } from "../services/sources/list_imports.service";

// GET /api/supplier-stock/sources/:id/imports — historial de lecturas.
export const listImportsController = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePaginationParams(req.query);
  const result = await listImportsService(Number(req.params.id), req.user as IToken, page, limit);
  ok(res, 200, result);
});
