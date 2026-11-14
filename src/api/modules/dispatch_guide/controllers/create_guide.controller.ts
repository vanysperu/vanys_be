import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createGuideService } from "../services/guides/create_guide.service";
import type { GuideInput } from "../types/dispatch_guide.types";

// POST /api/dispatch-guide/guides (borrador)
export const createGuideController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 201, await createGuideService(req.body as GuideInput, req.user as IToken), "Borrador de guía creado");
});
