import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { setCompanyFeaturesService } from "../services/set_features.service";

// PUT /api/company-feature/:companyId { features: { codigo: boolean } }
export const setCompanyFeaturesController = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.user as IToken;
  const features = await setCompanyFeaturesService(
    Number(req.params.companyId),
    req.body.features as Record<string, boolean>,
    userId
  );
  ok(res, 200, features, "Funcionalidades actualizadas");
});
