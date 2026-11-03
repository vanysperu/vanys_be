import { IToken } from "../../../../interfaces/IToken.interface";
import { AppError } from "../../../../../core/errors/AppError";
import { resolveBusinessUnitFilter } from "../../../../../core/rbac/businessUnitScope";
import { isOutOfWriteScope, resolveWriteScope } from "../../../../../core/rbac/writeScope";
import { DataBase } from "../../../../../database";

// Empresa y tienda de una fila de dinero de una cotización (pago, gasto,
// compra): las hereda de su cotización.
export interface QuotationOwnership {
  company_id: number;
  business_unit_id: number | null;
}

// Alcance de LECTURA (mismo criterio que assertQuotationBelongsToCaller): el
// permiso "ver todas las tiendas" amplía lo que se ve.
export const isOutOfReadScope = (record: QuotationOwnership, user: IToken): boolean => {
  if (user.isSystem) return false;
  if (Number(record.company_id) !== user.companyId) return true;
  const scopedBusinessUnitId = resolveBusinessUnitFilter(user);
  if (scopedBusinessUnitId === undefined) return false;
  return record.business_unit_id === null || Number(record.business_unit_id) !== scopedBusinessUnitId;
};

/**
 * Alcance de ESCRITURA al registrar dinero en una cotización (pago, adelanto,
 * gasto). Decisión del usuario: un gestor ligado a una tienda que tiene "ver
 * todas las tiendas" VE las cotizaciones de las demás tiendas, pero solo
 * registra dinero en la suya (CLAUDE.md 11.1: ese permiso es solo de lectura).
 *
 * - Cotización inexistente → 404.
 * - Fuera de lo que el usuario puede ver → 403 (mismo mensaje de siempre).
 * - La ve pero no es de su tienda → 403 con código STORE_WRITE_SCOPE, para
 *   que el mensaje explique por qué (no un "no existe" sobre algo que tiene
 *   abierto en pantalla).
 */
export const assertQuotationWritable = async (quotationId: number, user: IToken, action: string): Promise<void> => {
  const quotation = await DataBase.instance.quotation.findOne({
    where: { id: quotationId },
    attributes: ["id", "company_id", "business_unit_id"],
  });
  if (!quotation) throw new AppError(404, "La cotización no existe");
  if (isOutOfReadScope(quotation, user)) throw new AppError(403, "No tienes acceso a esta cotización");
  if (!isOutOfWriteScope(quotation, resolveWriteScope(user))) return;

  throw new AppError(403, `Solo puedes ${action} en cotizaciones de tu tienda`, undefined, "STORE_WRITE_SCOPE");
};
