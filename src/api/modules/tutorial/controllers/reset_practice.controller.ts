import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resetPracticeService } from "../services/reset_practice.service";

// POST /api/tutorial/practice/reset
export const resetPracticeController = asyncHandler(async (req: Request, res: Response) => {
  const session = await resetPracticeService(req.user as IToken);
  ok(res, 200, session, "La empresa de práctica quedó como nueva");
});
