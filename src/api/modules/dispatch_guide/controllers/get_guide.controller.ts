import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getGuideService } from "../services/guides/get_guide.service";

// GET /api/dispatch-guide/guides/:id
export const getGuideController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await getGuideService(Number(req.params.id), req.user as IToken));
});
