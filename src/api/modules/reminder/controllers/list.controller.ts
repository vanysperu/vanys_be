import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { listRemindersService } from "../services/find/list.service";
import { ReminderBox, ReminderStatusFilter } from "../types/reminder.types";

const BOXES: ReminderBox[] = ["received", "sent"];
const STATUSES: ReminderStatusFilter[] = ["active", "upcoming", "due", "read", "cancelled"];

export const listRemindersController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { box, status, dateFrom, dateTo } = req.query;

  const resp = await listRemindersService({
    // El usuario siempre sale del token: nadie puede listar los de otro.
    actorId: user.userId,
    box: BOXES.find((value) => value === box) ?? "received",
    status: STATUSES.find((value) => value === status) ?? "active",
    dateFrom: (dateFrom as string) || undefined,
    dateTo: (dateTo as string) || undefined,
    page: Number(req.query.page) || 1,
    limit: Math.min(Number(req.query.limit) || 20, 100),
  });

  const message = resp.data.length === 0 ? "No hay recordatorios" : "Recordatorios obtenidos correctamente";
  ok(res, 200, resp, message);
});
