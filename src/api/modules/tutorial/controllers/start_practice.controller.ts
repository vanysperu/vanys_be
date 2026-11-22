import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { startPracticeService } from "../services/start_practice.service";

// POST /api/tutorial/practice/start
export const startPracticeController = asyncHandler(async (req: Request, res: Response) => {
  const session = await startPracticeService(req.user as IToken);
  ok(res, 200, session, "Entraste a tu empresa de práctica");
});
