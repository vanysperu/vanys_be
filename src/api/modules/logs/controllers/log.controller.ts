import { Request, Response } from "express";
import { LogAttributes } from "../model/log.model";
import { createLogService } from "../services/create/log.services";
import { getLogsService } from "../services/find/log.service";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { IToken } from "../../../interfaces/IToken.interface";

// Controlador interno (no usa req/res)
export const createLogController = async (data: Omit<LogAttributes, "id" | "created_at">) => {
  try {
    const log = await createLogService(data);
    return log;
  } catch (error: unknown) {
    console.error("Error en createLogController:", error);
    const message = error instanceof Error ? error.message : undefined;
    throw new AppError(400, "Error interno al crear log", message);
  }
};

// Controlador expuesto para endpoint
export const getLogsController = asyncHandler(async (req: Request, res: Response) => {
  const { userId, companyId, isSystem } = req.user as IToken;
  const { all, byUserId, page, limit, startDate, endDate } = req.query;

  const logs = await getLogsService({
    userId,
    all: !!all,
    byUserId: Number(byUserId),
    page: Number(page),
    limit: Number(limit),
    startDate: (startDate || "")?.toString(),
    endDate: (endDate || "")?.toString(),
    companyId: isSystem ? null : companyId,
  });

  ok(res, 200, logs);
});
