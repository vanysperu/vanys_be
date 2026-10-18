import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { listReminderRecipientsService } from "../services/find/recipients.service";

export const listReminderRecipientsController = asyncHandler(async (req: Request, res: Response) => {
  const search = typeof req.query.search === "string" && req.query.search.trim() ? req.query.search.trim() : undefined;
  const recipients = await listReminderRecipientsService(req.user as IToken, search);
  ok(res, 200, recipients);
});
