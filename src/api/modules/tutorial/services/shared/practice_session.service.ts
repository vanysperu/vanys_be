import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { generateJWT } from "../../../../../helpers/generate-jwt";
import { createToken } from "../../../token/services/create/token.service";
import { closeAllSessions } from "../../../token/services/update/token.service";
import { getRoleIdsByUserId } from "../../../user_role/services/find/user_role.service";
import { PracticeSessionResult } from "../../types/tutorial.types";

// Abre la sesión del usuario de práctica, igual que /signin (tabla `token` +
// JWT con su uuid). Solo cierra las sesiones de práctica anteriores: la sesión
// de la cuenta real queda intacta para volver a ella.
export const openPracticeSession = async (practiceUserId: number): Promise<PracticeSessionResult> => {
  const practiceUser = await DataBase.instance.user.findByPk(practiceUserId, {
    attributes: ["id", "name", "paternal_lastname", "email", "practice_of_user_id"],
  });
  if (!practiceUser?.practice_of_user_id) {
    throw new AppError(500, "No se pudo abrir la sesión de práctica", undefined, "PRACTICE_SESSION_FAILED");
  }

  await closeAllSessions({ user_id: practiceUserId });
  const token = await createToken({ user_id: practiceUserId });
  const roles = await getRoleIdsByUserId(practiceUserId);
  const jwt = await generateJWT({ _key: token.uuid, _userId: practiceUserId, _roles: roles });

  const fullName = [practiceUser.name, practiceUser.paternal_lastname].filter(Boolean).join(" ");
  return { token: jwt, user: { fullName, email: practiceUser.email } };
};
