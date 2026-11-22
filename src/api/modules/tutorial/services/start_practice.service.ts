import { IToken } from "../../../interfaces/IToken.interface";
import { DataBase } from "../../../../database";
import { PracticeSessionResult } from "../types/tutorial.types";
import { resolvePracticeOwner } from "./shared/practice_owner.service";
import { openPracticeSession } from "./shared/practice_session.service";
import { createPracticeWorkspace, upsertPracticeUser, usableWorkspace } from "./shared/practice_workspace.service";
import { syncPracticeFeatures } from "./shared/practice_features.service";

// POST /tutorial/practice/start: entra a la empresa de práctica de la persona.
// La primera vez la crea (con ejemplos); después reutiliza la misma, así lo
// que practicó sigue ahí. Todo en una transacción (CLAUDE.md §12).
export const startPracticeService = async (user: IToken): Promise<PracticeSessionResult> => {
  const owner = await resolvePracticeOwner(user);

  const practiceUserId = await DataBase.instance.sequelize.transaction(async (transaction) => {
    const existing = await DataBase.instance.user.findOne({
      where: { practice_of_user_id: owner.realUserId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const reusable = existing ? await usableWorkspace(existing, owner, transaction) : null;
    const workspace = reusable ?? (await createPracticeWorkspace({ owner, transaction }));
    await syncPracticeFeatures({
      realCompanyId: owner.realCompanyId,
      practiceCompanyId: workspace.companyId,
      actorId: owner.realUserId,
      transaction,
    });
    return upsertPracticeUser({ owner, existing, workspace, transaction });
  });

  return openPracticeSession(practiceUserId);
};
