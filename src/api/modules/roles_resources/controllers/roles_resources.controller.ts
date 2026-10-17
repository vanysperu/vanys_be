import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { DataBase } from "../../../../database";
import { getRoleResourceTree } from "../services/find/roles_resources.service";
import { grantResourcesToRole } from "../services/create/roles_resources.service";
import { revokeResourcesFromRole } from "../services/delete/roles_resources.service";
import { SetRoleResourcesDto } from "../dtos/set-role-resources.dto";

/**
 * Evita que la Empresa A vea/edite los accesos de un rol de la Empresa B
 * adivinando su roleId. Un usuario is_system (plataforma) no tiene esta
 * restricción.
 */
const assertRoleBelongsToCaller = async (roleId: number, user: IToken): Promise<boolean> => {
  if (user.isSystem) return true;

  const role = await DataBase.instance.role.findOne({ where: { id: roleId } });
  if (!role) return false;

  return role.company_id === user.companyId;
};

/**
 * Los roles de plantilla (Administrador/Especialista/Gestor, company_id
 * NULL) son UNA sola fila compartida por todas las empresas — nunca
 * "pertenecen" a ninguna (CLAUDE.md sección 10: una empresa solo otorga/
 * quita accesos sobre SUS PROPIOS roles). Permitir editarlos filtraría el
 * cambio a todas las demás empresas que usan ese mismo rol, así que el
 * guardado se mantiene bloqueado (assertRoleBelongsToCaller sin tocar).
 * Pero SOLO LEER ese árbol es inofensivo — un admin de empresa ya ve estos
 * roles en su listado y necesita poder abrir "Gestionar accesos" para
 * consultar qué tiene otorgado cada uno, aunque no pueda modificarlo.
 */
const assertRoleReadableByCaller = async (roleId: number, user: IToken): Promise<boolean> => {
  if (user.isSystem) return true;

  const role = await DataBase.instance.role.findOne({ where: { id: roleId } });
  if (!role) return false;

  return role.company_id === user.companyId || role.company_id === null;
};

export const getRoleResourceTreeController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { roleId } = req.params;

  if (!(await assertRoleReadableByCaller(Number(roleId), user))) {
    throw new AppError(403, "No tienes acceso a este rol");
  }

  const tree = await getRoleResourceTree(Number(roleId));

  ok(res, 200, tree, "Árbol de accesos obtenido correctamente");
});

export const setRoleResourcesController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { roleId } = req.params;
  const { resourceIds } = req.body as SetRoleResourcesDto;

  if (!(await assertRoleBelongsToCaller(Number(roleId), user))) {
    throw new AppError(403, "No tienes acceso a este rol");
  }

  const transaction = await DataBase.instance.sequelize.transaction();

  // Try/catch se mantiene únicamente para el rollback de la transacción;
  // el error siempre se vuelve a lanzar al final para que lo capture el
  // errorHandler central (CLAUDE.md sección 5).
  try {
    const add = resourceIds?.add;
    if (add && add.length > 0) {
      await grantResourcesToRole({
        roleId: Number(roleId),
        resourceIds: add,
        createdBy: user.userId,
        callerUserId: user.userId,
        callerIsSystem: user.isSystem,
        transaction,
      });
    }

    const remove = resourceIds?.remove;
    if (remove && remove.length > 0) {
      await revokeResourcesFromRole({ roleId: Number(roleId), resourceIds: remove, transaction });
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw new AppError(500, "Sucedió un error inesperado al guardar los accesos");
  }

  ok(res, 200, resourceIds, "Accesos del rol actualizados correctamente");
});
