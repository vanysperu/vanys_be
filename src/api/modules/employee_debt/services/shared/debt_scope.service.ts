import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { isOutOfWriteScope, WriteScope } from "../../../../../core/rbac/writeScope";

// Tienda a la que corresponde una deuda: la de la cotización de su compra o de
// su gasto (esas deudas guardan business_unit_id NULL) o, si es manual, la suya. Es el MISMO criterio con el que Caja reparte una reposición por
// tienda (REIMBURSEMENT_SCOPE_SQL en cash_movement/services/shared/cash_flow.sql.ts).
export const DEBT_BUSINESS_UNIT_SQL = "COALESCE(dq.business_unit_id, ed.business_unit_id)";

export const DEBT_QUOTATION_JOINS_SQL = `
  LEFT JOIN purchase_order_item_purchase dpop ON dpop.id = ed.purchase_order_item_purchase_id
  LEFT JOIN purchase_order_item dpoi ON dpoi.id = dpop.purchase_order_item_id
  LEFT JOIN purchase_order dpo ON dpo.id = dpoi.purchase_order_id
  LEFT JOIN quotation_expense dqe ON dqe.id = COALESCE(ed.quotation_expense_id, dpop.quotation_expense_id)
  LEFT JOIN quotation dq ON dq.id = COALESCE(dpo.quotation_id, dqe.quotation_id)`;

/**
 * Tienda efectiva de cada deuda (id → business_unit_id o null). Lectura
 * simple, sin bloqueo: la tienda de una cotización no cambia por corregir
 * dinero, y las deudas ya están bloqueadas por el caller.
 */
export async function loadDebtBusinessUnits(
  debtIds: readonly number[],
  transaction?: Transaction
): Promise<Map<number, number | null>> {
  if (debtIds.length === 0) return new Map();

  const rows = await DataBase.instance.sequelize.query<{ id: number | string; business_unit_id: number | string | null }>(
    `SELECT ed.id, ${DEBT_BUSINESS_UNIT_SQL} AS business_unit_id
     FROM employee_debt ed
     ${DEBT_QUOTATION_JOINS_SQL}
     WHERE ed.id IN (:debtIds)`,
    { type: QueryTypes.SELECT, replacements: { debtIds: [...new Set(debtIds)] }, transaction }
  );

  return new Map(
    rows.map((row) => [Number(row.id), row.business_unit_id === null ? null : Number(row.business_unit_id)])
  );
}

// Filtra, de una lista de deudas, las que el usuario puede tocar. Un usuario
// sin tienda propia (o el Super Administrador) las conserva todas sin
// consultar nada.
export async function filterDebtsInWriteScope<T extends { id: number; company_id: number }>(
  debts: readonly T[],
  scope: WriteScope,
  transaction?: Transaction
): Promise<T[]> {
  if (scope.businessUnitId === undefined) {
    return debts.filter((debt) => !isOutOfWriteScope({ company_id: debt.company_id, business_unit_id: null }, scope));
  }
  const businessUnits = await loadDebtBusinessUnits(
    debts.map((debt) => debt.id),
    transaction
  );
  return debts.filter(
    (debt) =>
      !isOutOfWriteScope({ company_id: debt.company_id, business_unit_id: businessUnits.get(debt.id) ?? null }, scope)
  );
}

// Todas las deudas tienen que estar dentro del alcance de escritura del
// usuario; si alguna no, se responde como si el registro no existiera (404,
// no se confirma qué hay en otra empresa o tienda).
export async function assertDebtsInWriteScope(
  debts: readonly { id: number; company_id: number }[],
  scope: WriteScope,
  notFoundMessage: string,
  transaction?: Transaction
): Promise<void> {
  const inScope = await filterDebtsInWriteScope(debts, scope, transaction);
  if (inScope.length === debts.length) return;
  throw new AppError(404, notFoundMessage);
}
