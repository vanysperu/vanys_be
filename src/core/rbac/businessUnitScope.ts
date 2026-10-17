import { QueryTypes } from "sequelize";
import { DataBase } from "../../database";
import { IToken } from "../../api/interfaces/IToken.interface";
import { AppError } from "../errors/AppError";

// Código exacto del resource sembrado en
// database/seeders/20260923120000-seed-view-all-business-units-resource.js
export const VIEW_ALL_BUSINESS_UNITS_CODE = "roles_access.viewAllBusinessUnits.button";

// Un rol is_system ya tiene todos los resources otorgados implícitamente
// (mismo criterio que getMyAccess/getRoleResourceTree), así que ni siquiera
// consulta roles_resources.
export const userHasViewAllBusinessUnitsGrant = async (userId: number, isSystem: boolean): Promise<boolean> => {
  if (isSystem) return true;

  const query = `
    SELECT COUNT(*) AS total
    FROM user_role ur
    INNER JOIN role r ON r.id = ur.role_id AND r.status = true
    INNER JOIN roles_resources rr ON rr.role_id = ur.role_id
    INNER JOIN resources res ON res.id = rr.resource_id AND res.active = true
    WHERE ur.user_id = ? AND res.code = ?
  `;

  const rows = (await DataBase.instance.sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements: [userId, VIEW_ALL_BUSINESS_UNITS_CODE],
  })) as { total: number }[];

  return (rows[0]?.total ?? 0) > 0;
};

// Regla de oro (pedido explícito del usuario): un usuario con tienda propia
// asignada (business_unit_id) solo ve/crea/modifica datos de ESA tienda,
// salvo que su rol tenga el permiso "ver todas las tiendas" — is_system o un
// usuario sin tienda propia (ej. admin de empresa) ya ven todas sin
// necesitar el permiso, porque no hay una tienda a la cual limitarlos.
// Devuelve el business_unit_id a usar como filtro, o `undefined` cuando el
// caller no debe limitarse a ninguna tienda en particular.
export function resolveBusinessUnitFilter(user: IToken): number | undefined {
  if (user.isSystem) return undefined;
  if (user.canViewAllBusinessUnits) return undefined;
  if (user.businessUnitId === null) return undefined;
  return user.businessUnitId;
}

// `resolveBusinessUnitFilter` devuelve undefined para un admin de empresa
// (no está limitado a una tienda), y en ese caso los controllers caen al
// `business_unit_id` que mande el body. Ese valor es un id crudo del
// cliente y NUNCA se validó: un admin de la Empresa A podía crear un
// movimiento de caja o un cliente apuntando a una tienda de la Empresa B.
// El registro quedaba huérfano — pertenece a A (company_id), pero ninguna
// vista filtrada por tienda lo muestra (ni las de A, porque la tienda no es
// suya; ni las de B, porque la empresa no es suya), mientras que los totales
// a nivel empresa sí lo suman. Plata registrada contra una tienda que no
// existe en la empresa (CLAUDE.md sección 10: nunca confiar en un id de
// alcance que mande el frontend).
//
// Devuelve el id ya validado, o lanza AppError si no pertenece a la empresa.
export async function resolveTargetBusinessUnitId(
  user: IToken,
  bodyBusinessUnitId: unknown
): Promise<number | null> {
  const scoped = resolveBusinessUnitFilter(user);
  if (scoped !== undefined) return scoped;

  if (bodyBusinessUnitId === null || bodyBusinessUnitId === undefined || bodyBusinessUnitId === "") return null;

  const businessUnitId = Number(bodyBusinessUnitId);
  if (!Number.isInteger(businessUnitId) || businessUnitId <= 0) {
    throw new AppError(400, "La tienda seleccionada no es válida");
  }

  const businessUnit = await DataBase.instance.business_unit.findOne({ where: { id: businessUnitId } });
  if (!businessUnit) throw new AppError(404, "La tienda seleccionada no existe");

  // Un is_system puede operar sobre cualquier empresa, así que para él solo
  // importa que la tienda exista.
  if (user.isSystem) return businessUnitId;

  if (businessUnit.company_id !== user.companyId) {
    throw new AppError(403, "La tienda seleccionada no pertenece a esta empresa");
  }

  return businessUnitId;
}
