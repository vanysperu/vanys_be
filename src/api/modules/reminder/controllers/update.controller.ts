import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { updateReminderService } from "../services/update/update.service";
import { ReminderInputDto } from "../types/reminder.types";

export const updateReminderController = asyncHandler(async (req: Request, res: Response) => {
  const reminder = await updateReminderService(Number(req.params.id), req.body as ReminderInputDto, req.user as IToken);
  ok(res, 200, reminder, "Recordatorio actualizado correctamente");
});
