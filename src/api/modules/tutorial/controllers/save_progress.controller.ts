import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { saveProgressService } from "../services/save_progress.service";

// PUT /api/tutorial/progress/:code { step_index, completed }
export const saveProgressController = asyncHandler(async (req: Request, res: Response) => {
  const { step_index: stepIndex, completed } = req.body as { step_index: number; completed: boolean };
  const progress = await saveProgressService(req.user as IToken, { lessonCode: req.params.code ?? "", stepIndex, completed });
  ok(res, 200, progress, completed ? "Lección completada" : "Avance guardado");
});
