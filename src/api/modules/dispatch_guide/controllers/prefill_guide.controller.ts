import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { prefillGuideService } from "../services/guides/prefill_guide.service";

// GET /api/dispatch-guide/prefill?quotationId= | ?transferId=
export const prefillGuideController = asyncHandler(async (req: Request, res: Response) => {
  const quotationId = Number(req.query.quotationId) > 0 ? Number(req.query.quotationId) : undefined;
  const transferId = Number(req.query.transferId) > 0 ? Number(req.query.transferId) : undefined;
  ok(res, 200, await prefillGuideService({ quotationId, transferId }, req.user as IToken));
});
