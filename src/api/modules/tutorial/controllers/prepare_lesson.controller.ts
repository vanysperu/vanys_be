import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { prepareLessonService } from "../services/prepare_lesson.service";
import { LessonPreparation } from "../types/tutorial.types";

// POST /api/tutorial/practice/prepare { preparation }
export const prepareLessonController = asyncHandler(async (req: Request, res: Response) => {
  const { preparation } = req.body as { preparation: LessonPreparation };
  const prepared = await prepareLessonService(req.user as IToken, preparation);
  ok(res, 201, prepared, "Lección preparada");
});
