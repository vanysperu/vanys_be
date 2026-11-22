import { IToken } from "../../../interfaces/IToken.interface";
import { DataBase } from "../../../../database";
import { utcToBusinessParts } from "../../../../utils/dateUtils";
import { LessonProgressDto } from "../types/tutorial.types";
import { TutorialProgressModel } from "../model/tutorial_progress.model";
import { resolvePracticeOwner } from "./shared/practice_owner.service";

// Hay pocas lecciones (una fila por lección y persona): este tope es solo una
// red de seguridad (CLAUDE.md §4, nunca traer todo sin límite).
const MAX_LESSONS = 100;

export const toLessonProgressDto = (row: TutorialProgressModel): LessonProgressDto => ({
  lesson_code: row.lesson_code,
  status: row.status,
  step_index: row.step_index,
  completed_at: row.completed_at ? utcToBusinessParts(row.completed_at) : null,
});

// GET /tutorial/progress: avance de la persona REAL (también desde la práctica).
export const listProgressService = async (user: IToken): Promise<LessonProgressDto[]> => {
  const owner = await resolvePracticeOwner(user);
  const rows = await DataBase.instance.tutorial_progress.findAll({
    where: { user_id: owner.realUserId },
    order: [["lesson_code", "ASC"]],
    limit: MAX_LESSONS,
  });
  return rows.map(toLessonProgressDto);
};
