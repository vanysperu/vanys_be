import { Request, Response } from "express";
import { IToken } from "../../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../../core/utils/asyncHandler";
import { ok } from "../../../../../core/utils/response";
import { parsePaginationParams } from "../../../../../core/validators/pagination.validator";
import { listMockupsService } from "../../services/mockup/list_mockups.service";

// GET /quotation/:id/mockups?page&limit — diseños de la cotización (21-nov).
export const listMockupsController = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePaginationParams(req.query);
  const result = await listMockupsService(Number(req.params.id), req.user as IToken, { page, limit });
  ok(res, 200, result, "Diseños obtenidos correctamente");
});
