import { Op, QueryTypes, Transaction, literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

// Rol plantilla "Administrador" (ver seed-core-data.js) — company_id NULL,
// compartido por todas las empresas; lo que varía por empresa es a quién se
// lo asignan vía user_role.
const ADMIN_ROLE_ID = 2;

export class LastCompanyAdminError extends Error {}

// Nada impedía que el único usuario con rol Administrador de una empresa se
// deshabilitara a sí mismo (o a cualquier otro) dejando a esa empresa sin
// NADIE que pueda volver a gestionar usuarios/roles — el único camino de
// recuperación quedaba en soporte/plataforma (is_system). Se bloquea el
// toggle cuando el usuario objetivo está ACTIVO, tiene el rol Administrador,
// y es el único activo con ese rol en su empresa.
// `alsoBeingDisabled`: ids de otros usuarios que se están deshabilitando en
// la MISMA operación (batch) — sin esto, deshabilitar a los 2 únicos admins
// de una empresa en un solo batch pasaba la validación para ambos (cada
// chequeo veía al otro todavía "activo" en ese instante).
export const assertNotLastCompanyAdmin = async (userId: number, alsoBeingDisabled: number[] = []): Promise<void> => {
  const target = await DataBase.instance.user.findOne({ where: { id: userId } });
  if (!target || !target.status || target.company_id === null) return; // ya inactivo, o is_system: no aplica

  const isTargetAdmin = await DataBase.instance.userRole.findOne({
    where: { user_id: userId, role_id: ADMIN_ROLE_ID },
  });
  if (!isTargetAdmin) return;

  const excludedIds = [userId, ...alsoBeingDisabled];
  const [row] = (await DataBase.instance.sequelize.query(
    `SELECT COUNT(*) AS total
     FROM user u
     INNER JOIN user_role ur ON ur.user_id = u.id
     WHERE ur.role_id = :adminRoleId
       AND u.company_id = :companyId
       AND u.status = true
       AND u.is_deleted = false
       AND u.id NOT IN (:excludedIds)`,
    { type: QueryTypes.SELECT, replacements: { adminRoleId: ADMIN_ROLE_ID, companyId: target.company_id, excludedIds } }
  )) as { total: number }[];

  if (Number(row?.total ?? 0) === 0) {
    throw new LastCompanyAdminError(
      "No puedes deshabilitar al único Administrador activo de la empresa — asigna el rol a otro usuario primero."
    );
  }
};

export const disableOrEnableUserById = async ({
  userId,
  updatedBy,
  transaction,
}: {
  userId: number;
  updatedBy?: number;
  transaction?: Transaction;
}) => {
  try {
     await DataBase.instance.user.update(
      {
        status: literal("CASE WHEN status = true THEN false ELSE true END"),
        updated_at: nowUtc(),
        updated_by: updatedBy,
      },
      {
        where: {
          id: userId,
        },
        transaction,
      }
    );
     return await DataBase.instance.user.findByPk(userId, {
      transaction,
      attributes: ["id", "status"],
    });
  } catch (error) {
    throw error;
  }
};
export const batchDisableUserById = async ({
  ids,
  updatedBy,
}: {
  ids: number[];
  updatedBy?: number;
}) => {
  try {
    return await DataBase.instance.user.update(
      {
        status: false,    
        updated_at: nowUtc(),
        updated_by: updatedBy,
      },
      {
        where: {
          id: {
            [Op.in]: ids,
          },
        },
      }
    );
  } catch (error) {
    throw error;
  }
};