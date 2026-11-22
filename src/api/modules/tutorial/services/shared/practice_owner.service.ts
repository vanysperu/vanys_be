import { IToken } from "../../../../interfaces/IToken.interface";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { PracticeOwner } from "../../types/tutorial.types";

// Persona y empresa REALES detrás de la sesión. Con la cuenta real, son ella
// misma; con el usuario de práctica, las que lo crearon. Así el avance se
// guarda siempre a nombre de la persona real y "Reiniciar práctica" funciona
// desde dentro de la práctica.
export const resolvePracticeOwner = async (user: IToken): Promise<PracticeOwner> => {
  if (user.isSystem || !user.companyId) {
    throw new AppError(
      400,
      "El modo enseñanza es para las cuentas de una empresa (el Super Administrador no tiene empresa)",
      undefined,
      "PRACTICE_NOT_AVAILABLE"
    );
  }
  const sessionUser = await DataBase.instance.user.findByPk(user.userId, { attributes: ["id", "practice_of_user_id"] });
  if (!sessionUser) throw new AppError(404, "No se encontró tu usuario");
  if (!sessionUser.practice_of_user_id) return { realUserId: user.userId, realCompanyId: user.companyId };

  const practiceCompany = await DataBase.instance.company.findByPk(user.companyId, { attributes: ["id", "practice_of_company_id"] });
  if (!practiceCompany?.practice_of_company_id) {
    throw new AppError(409, "Esta empresa de práctica no está enlazada a una empresa real", undefined, "PRACTICE_NOT_LINKED");
  }
  return { realUserId: Number(sessionUser.practice_of_user_id), realCompanyId: Number(practiceCompany.practice_of_company_id) };
};

// Ciertas acciones (preparar datos de una lección) solo se hacen dentro de la
// empresa de práctica: nunca deben crear nada en una empresa real.
export const assertPracticeSession = async (user: IToken): Promise<number> => {
  const companyId = user.companyId;
  if (!companyId) throw new AppError(403, "Esto solo se puede hacer en la empresa de práctica", undefined, "PRACTICE_ONLY");
  const company = await DataBase.instance.company.findByPk(companyId, { attributes: ["id", "is_practice"] });
  if (!company?.is_practice) throw new AppError(403, "Esto solo se puede hacer en la empresa de práctica", undefined, "PRACTICE_ONLY");
  return companyId;
};
