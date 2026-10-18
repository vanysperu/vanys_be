import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getDueRemindersService } from "../services/find/due.service";

export const dueRemindersController = asyncHandler(async (req: Request, res: Response) => {
  const result = await getDueRemindersService((req.user as IToken).userId);
  ok(res, 200, result);
});
