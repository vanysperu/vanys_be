import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveTargetCompanyId } from "../../../../core/rbac/companyScope";
import { createAdvertisementService } from "../services/create.service";

// POST /advertisement/create — la imagen ya se subió con POST /advertisement/image.
export const createAdvertisementController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveTargetCompanyId(user, req.body.company_id, "anuncios");

  const advertisement = await createAdvertisementService(
    {
      companyId,
      zone_id: req.body.zone_id,
      title: req.body.title,
      link_url: req.body.link_url,
      image_path: req.body.image_path,
      is_active: req.body.is_active,
    },
    user.userId
  );

  ok(res, 201, advertisement, "Anuncio creado correctamente");
});
