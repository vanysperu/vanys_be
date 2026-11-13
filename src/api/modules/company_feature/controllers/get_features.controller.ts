import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getCompanyFeaturesService } from "../services/get_features.service";

// GET /api/company-feature/:companyId — funcionalidades de una empresa (Empresas).
export const getCompanyFeaturesController = asyncHandler(async (req: Request, res: Response) => {
  const features = await getCompanyFeaturesService(Number(req.params.companyId));
  ok(res, 200, features);
});
