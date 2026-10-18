import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { toggleReminderService } from "../services/delete/disable.service";

export const toggleReminderController = asyncHandler(async (req: Request, res: Response) => {
  const reminder = await toggleReminderService(Number(req.params.id), (req.user as IToken).userId);
  const message = reminder.state === "cancelled" ? "Recordatorio cancelado" : "Recordatorio reactivado";
  ok(res, 200, reminder, message);
});
