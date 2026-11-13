import { IToken } from "../../../../interfaces/IToken.interface";
import { resolveTargetCompanyId } from "../../../../../core/rbac/companyScope";
import { assertCompanyHasInventory } from "./inventory_shared";

// Empresa sobre la que se opera (CLAUDE.md §10): la del usuario, o la que
// eligió el Super Administrador (que también tiene que tener el inventario).
export const resolveCompanyForInventory = async (user: IToken, requested: unknown): Promise<number> => {
  const companyId = await resolveTargetCompanyId(user, user.isSystem ? requested : undefined, "inventario");
  if (user.isSystem) await assertCompanyHasInventory(companyId);
  return companyId;
};
