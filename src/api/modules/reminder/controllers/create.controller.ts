import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createReminderService } from "../services/create/create.service";
import { ReminderInputDto } from "../types/reminder.types";

export const createReminderController = asyncHandler(async (req: Request, res: Response) => {
  const reminder = await createReminderService(req.body as ReminderInputDto, req.user as IToken);
  ok(res, 201, reminder, "Recordatorio programado correctamente");
});
