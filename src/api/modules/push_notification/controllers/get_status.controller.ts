import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getPushStatusService } from "../services/get_status.service";

// GET /api/push/status
export const getPushStatusController = asyncHandler(async (_req: Request, res: Response) => {
  ok(res, 200, getPushStatusService());
});
