import { IToken } from "../../../interfaces/IToken.interface";
import { DataBase } from "../../../../database";
import { nowUtc } from "../../../../utils/dateUtils";
import { LessonProgressDto, SaveProgressInput } from "../types/tutorial.types";
import { resolvePracticeOwner } from "./shared/practice_owner.service";
import { toLessonProgressDto } from "./list_progress.service";

// PUT /tutorial/progress/:code: guarda el paso seguro alcanzado o la lección
// completada. Una lección completada queda completada aunque se repita (la
// repetición solo mueve el paso); completar de nuevo actualiza la fecha.
export const saveProgressService = async (user: IToken, input: SaveProgressInput): Promise<LessonProgressDto> => {
  const owner = await resolvePracticeOwner(user);
  const now = nowUtc();

  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const existing = await DataBase.instance.tutorial_progress.findOne({
      where: { user_id: owner.realUserId, lesson_code: input.lessonCode },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!existing) {
      const created = await DataBase.instance.tutorial_progress.create(
        {
          id: 0,
          company_id: owner.realCompanyId,
          user_id: owner.realUserId,
          lesson_code: input.lessonCode,
          status: input.completed ? "completed" : "in_progress",
          step_index: input.stepIndex,
          completed_at: input.completed ? now : null,
          created_by: owner.realUserId,
          created_at: now,
          updated_by: owner.realUserId,
          updated_at: now,
        },
        { transaction }
      );
      return toLessonProgressDto(created);
    }

    const completed = input.completed || existing.status === "completed";
    await existing.update(
      {
        status: completed ? "completed" : "in_progress",
        step_index: input.stepIndex,
        completed_at: input.completed ? now : existing.completed_at,
        updated_by: owner.realUserId,
        updated_at: now,
      },
      { transaction }
    );
    return toLessonProgressDto(existing);
  });
};
