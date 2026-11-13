import { IToken } from "../../../../interfaces/IToken.interface";
import { AppError } from "../../../../../core/errors/AppError";
import { resolveTargetCompanyId } from "../../../../../core/rbac/companyScope";

// Empresa cuyo flujo se lee o guarda (CLAUDE.md sección 10): un usuario de
// empresa SIEMPRE la suya (lo que mande se ignora / 403 si es otra); el Super
// Administrador la elige en la pantalla.
export const resolveWorkflowCompanyId = async (user: IToken, requestedCompanyId: unknown): Promise<number> => {
  if (!user.isSystem && !user.companyId) throw new AppError(400, "Esta acción es solo para usuarios de una empresa");
  return resolveTargetCompanyId(user, user.isSystem ? requestedCompanyId : undefined, "flujos de producción");
};
