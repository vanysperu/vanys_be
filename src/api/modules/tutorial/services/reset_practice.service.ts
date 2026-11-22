import { IToken } from "../../../interfaces/IToken.interface";
import { DataBase } from "../../../../database";
import { PracticeSessionResult } from "../types/tutorial.types";
import { resolvePracticeOwner } from "./shared/practice_owner.service";
import { openPracticeSession } from "./shared/practice_session.service";
import { createPracticeWorkspace, retireWorkspace, upsertPracticeUser, usableWorkspace } from "./shared/practice_workspace.service";

// POST /tutorial/practice/reset: "Reiniciar práctica". La empresa de práctica
// actual se deshabilita (soft) y la persona sigue en una nueva, con los
// ejemplos de fábrica. Nada se borra físicamente; el avance de las lecciones
// (que es de la cuenta real) se conserva.
export const resetPracticeService = async (user: IToken): Promise<PracticeSessionResult> => {
  const owner = await resolvePracticeOwner(user);

  const practiceUserId = await DataBase.instance.sequelize.transaction(async (transaction) => {
    const existing = await DataBase.instance.user.findOne({
      where: { practice_of_user_id: owner.realUserId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const current = existing ? await usableWorkspace(existing, owner, transaction) : null;
    if (current) await retireWorkspace(current, owner.realUserId, transaction);
    const fresh = await createPracticeWorkspace({ owner, transaction });
    return upsertPracticeUser({ owner, existing, workspace: fresh, transaction });
  });

  return openPracticeSession(practiceUserId);
};
