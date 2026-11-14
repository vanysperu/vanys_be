import { Transaction } from "sequelize";
import { AppError } from "../../../../../core/errors/AppError";
import { resolveTargetCompanyId } from "../../../../../core/rbac/companyScope";
import { IToken } from "../../../../interfaces/IToken.interface";
import { hasCompanyFeature } from "../../../company_feature/services/shared/feature_store";

// El Super Administrador pasa el middleware de funcionalidad: acá se valida
// que la empresa elegida tenga las guías de remisión.
export const assertCompanyHasGuides = async (companyId: number, transaction?: Transaction): Promise<void> => {
  if (await hasCompanyFeature(companyId, "dispatch_guide", transaction)) return;
  throw new AppError(403, "La empresa no tiene habilitadas las guías de remisión", undefined, "FEATURE_DISABLED");
};

// Empresa sobre la que se opera (CLAUDE.md §10): la del usuario, o la que
// eligió el Super Administrador (que también tiene que tener la funcionalidad).
export const resolveCompanyForGuides = async (user: IToken, requested: unknown, entityLabel: string): Promise<number> => {
  const companyId = await resolveTargetCompanyId(user, user.isSystem ? requested : undefined, entityLabel);
  if (user.isSystem) await assertCompanyHasGuides(companyId);
  return companyId;
};

// Un registro de otra empresa responde 404: no se revela que existe.
export const belongsToCaller = (user: IToken, record: { company_id: number }): boolean =>
  user.isSystem || Number(record.company_id) === user.companyId;

// Campos opcionales vacíos se guardan como null (no como "").
export const blankToNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};
