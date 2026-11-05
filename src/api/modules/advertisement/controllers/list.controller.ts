import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { listAdvertisementsService } from "../services/list.service";
import { AdvertisementStatusFilter } from "../types/advertisement.types";

const STATUSES: AdvertisementStatusFilter[] = ["active", "inactive", "all"];

// GET /advertisement/list?page=&limit=&companyId=&zoneId=&status=&title=
// zoneId: una zona o "none" (sin zona); sin zoneId, todas.
// La empresa sale de la sesión; solo el Super Administrador elige otra.
export const listAdvertisementsController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { page, limit } = parsePaginationParams(req.query);
  const title = typeof req.query.title === "string" && req.query.title.trim() ? req.query.title.trim() : undefined;

  const zone = req.query.zoneId === "none" ? "none" : Number(req.query.zoneId) > 0 ? Number(req.query.zoneId) : undefined;

  const result = await listAdvertisementsService({
    companyId: resolveListCompanyFilter(user, req.query.companyId),
    zone,
    status: STATUSES.find((value) => value === req.query.status) ?? "all",
    title,
    page,
    limit,
  });

  ok(res, 200, result, result.data.length === 0 ? "No hay anuncios" : "Anuncios obtenidos correctamente");
});
