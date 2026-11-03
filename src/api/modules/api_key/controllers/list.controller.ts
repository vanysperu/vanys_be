import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { listApiKeysService } from "../services/list.service";
import { ApiKeyStatusFilter } from "../types/api_key.types";

const STATUSES: ApiKeyStatusFilter[] = ["active", "revoked", "all"];

// GET /api-key/list?page=&limit=&companyId=&status=&name=
export const listApiKeysController = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit } = parsePaginationParams(req.query);
  const companyId = Number(req.query.companyId) > 0 ? Number(req.query.companyId) : undefined;
  const name = typeof req.query.name === "string" && req.query.name.trim() ? req.query.name.trim() : undefined;

  const result = await listApiKeysService({
    page,
    limit,
    companyId,
    name,
    status: STATUSES.find((value) => value === req.query.status) ?? "all",
  });

  ok(res, 200, result, result.data.length === 0 ? "No hay API keys" : "API keys obtenidas correctamente");
});
