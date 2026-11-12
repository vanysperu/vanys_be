import { DataBase } from "../../../../../database";
import { IToken } from "../../../../interfaces/IToken.interface";
import { resolveBusinessUnitFilter } from "../../../../../core/rbac/businessUnitScope";

/**
 * ¿Puede quien llama gestionar a este usuario? Super Administrador: a todos.
 * Los demás: solo usuarios de su empresa y, si están limitados a una tienda,
 * solo los de esa tienda (CLAUDE.md secciones 10 y 11.1).
 */
export const userBelongsToCaller = async (targetUserId: number, user: IToken): Promise<boolean> => {
  if (user.isSystem) return true;

  const target = await DataBase.instance.user.findOne({
    where: { id: targetUserId },
    include: [{ association: "business_unit", attributes: ["id", "company_id"] }],
  });
  if (!target) return false;

  // Igual que getUserTenantInfo: si el objetivo tiene tienda, la empresa
  // de esa tienda manda; si no (admin de empresa sin tienda propia), cae
  // al company_id directo del usuario.
  const targetCompanyId =
    (target as unknown as { business_unit?: { company_id: number } | null }).business_unit?.company_id ??
    target.company_id ??
    null;
  if (targetCompanyId !== user.companyId) return false;

  const scopedBusinessUnitId = resolveBusinessUnitFilter(user);
  if (scopedBusinessUnitId === undefined) return true;

  return target.business_unit_id === scopedBusinessUnitId;
};
