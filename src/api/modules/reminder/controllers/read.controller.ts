import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { markReminderReadService } from "../services/update/markRead.service";

export const markReminderReadController = asyncHandler(async (req: Request, res: Response) => {
  const reminder = await markReminderReadService(Number(req.params.id), (req.user as IToken).userId);
  ok(res, 200, reminder, "Recordatorio marcado como visto");
});
