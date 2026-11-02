import { IToken } from "../../api/interfaces/IToken.interface";
import { AppError } from "../errors/AppError";
import { hasRouteAccess } from "../../middlewares/user-access";

// Alcance de ESCRITURA (crear, corregir, anular, restaurar) de un usuario
// sobre datos de dinero, siempre derivado de la sesión — nunca del body/query
// (CLAUDE.md secciones 10 y 11.1).
//   - companyId null = Super Administrador (cualquier empresa).
//   - businessUnitId = la tienda a la que está ligado; undefined = todas las
//     de su empresa (admin de empresa sin tienda propia).
//
// Diferencia con resolveBusinessUnitFilter (alcance de LECTURA): el permiso
// "ver todas las tiendas" amplía solo lo que se ve. Un gestor con tienda
// propia escribe ÚNICAMENTE en su tienda aunque tenga ese permiso (11.1: "el
// permiso de ver todas las tiendas es solo de lectura").
export interface WriteScope {
  companyId: number | null;
  businessUnitId: number | undefined;
  // Cierre de caja: puede corregir/anular/restaurar filas de un mes CERRADO
  // (se registra como ajuste en el mes abierto). Opcional: ausente = false.
  canAdjustClosedPeriods?: boolean;
}

// Capacidad (sin endpoint propio) del resource cash_closing.adjust.button,
// sembrado por 20261102100100-seed-cash-closing-module.js.
export const CASH_ADJUST_CAPABILITY = { route: "/cash-closing/adjust", verb: "POST" } as const;

export function resolveWriteScope(user: IToken): WriteScope {
  if (user.isSystem) return { companyId: null, businessUnitId: undefined, canAdjustClosedPeriods: true };
  // Un usuario de empresa sin empresa asignada no debería existir; si
  // existiera, un companyId null lo dejaría operar como Super Administrador.
  if (user.companyId === null) {
    throw new AppError(403, "Tu usuario no pertenece a ninguna empresa", undefined, "NO_COMPANY_SCOPE");
  }
  return {
    companyId: user.companyId,
    businessUnitId: user.businessUnitId ?? undefined,
    canAdjustClosedPeriods: hasRouteAccess(user, CASH_ADJUST_CAPABILITY.route, CASH_ADJUST_CAPABILITY.verb),
  };
}

// Una fila fuera del alcance se responde como si no existiera (404): no se
// confirma que ese id exista en otra empresa o tienda. Una fila SIN tienda
// (business_unit_id null) también queda fuera para un usuario ligado a una
// tienda: no es de la suya.
export function isOutOfWriteScope(
  record: { company_id: number; business_unit_id: number | null },
  scope: WriteScope
): boolean {
  if (scope.companyId !== null && Number(record.company_id) !== scope.companyId) return true;
  if (scope.businessUnitId === undefined) return false;
  return record.business_unit_id === null || Number(record.business_unit_id) !== scope.businessUnitId;
}
