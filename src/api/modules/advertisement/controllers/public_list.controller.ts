import { Request, Response } from "express";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { listPublicAdvertisementsService } from "../services/public_list.service";

// GET /public/advertisements?zone=&zone_id=&page=&limit= — anuncios prendidos
// de la empresa de la key, en su orden. `zone` (código) o `zone_id` filtran por
// lugar de la web. La empresa nunca sale del query.
export const listPublicAdvertisementsController = asyncHandler(async (req: Request, res: Response) => {
  const apiKey = req.apiKey;
  if (!apiKey) throw new AppError(401, "API key inválida o revocada", undefined, "INVALID_API_KEY");

  const { page, limit } = parsePaginationParams(req.query);
  const zoneCode = typeof req.query.zone === "string" && req.query.zone.trim() ? req.query.zone.trim() : undefined;
  const zoneId = Number(req.query.zone_id) > 0 ? Number(req.query.zone_id) : undefined;

  const result = await listPublicAdvertisementsService({
    companyId: apiKey.companyId,
    zoneCode,
    zoneId,
    page,
    limit,
    baseUrl: `${req.protocol}://${req.get("host")}`,
  });

  ok(res, 200, result, result.data.length === 0 ? "No hay anuncios" : "Anuncios obtenidos correctamente");
});
