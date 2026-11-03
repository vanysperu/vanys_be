import { AppError } from "../../../../../core/errors/AppError";
import { WriteScope } from "../../../../../core/rbac/writeScope";
import { PaginatedResult } from "../../../../../core/utils/paginate";
import { listMoneyCorrections } from "../../../money_correction/services/find/money_correction.service";
import { MoneyCorrectionListItem, MoneyCorrectionSource } from "../../../money_correction/types/money_correction.types";
import { loadSourceOwnership } from "../shared/correction_source_ownership";

const isOutOfReadScope = (companyId: number, businessUnitIds: Array<number | null>, scope: WriteScope): boolean => {
  if (scope.companyId !== null && companyId !== scope.companyId) return true;
  if (scope.businessUnitId === undefined) return false;
  return !businessUnitIds.includes(scope.businessUnitId);
};

// Historial de correcciones de CUALQUIER fila de Caja (money_correction): qué
// tenía, qué quedó, quién lo corrigió, cuándo y por qué. Más reciente
// primero. El historial es de lectura, así que el alcance es el de lectura:
// `scope.businessUnitId` ya viene de resolveBusinessUnitFilter (un gestor con
// "ver todas las tiendas" lee el historial de las de su empresa).
const getCashMovementCorrections = async ({
  source,
  sourceId,
  scope,
  page,
  limit,
}: {
  source: MoneyCorrectionSource;
  sourceId: number;
  scope: WriteScope;
  page: number;
  limit: number;
}): Promise<PaginatedResult<MoneyCorrectionListItem>> => {
  const owner = await loadSourceOwnership(source, sourceId);
  // Fuera de la empresa/tienda del usuario responde como si no existiera.
  if (!owner || isOutOfReadScope(owner.company_id, owner.business_unit_ids, scope)) {
    throw new AppError(404, "El movimiento no existe");
  }

  return listMoneyCorrections({ sourceType: source, sourceId, page, limit });
};

export { getCashMovementCorrections };
