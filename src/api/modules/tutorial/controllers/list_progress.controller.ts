import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { listProgressService } from "../services/list_progress.service";

// GET /api/tutorial/progress
export const listProgressController = asyncHandler(async (req: Request, res: Response) => {
  const progress = await listProgressService(req.user as IToken);
  ok(res, 200, progress, "Avance obtenido correctamente");
});
