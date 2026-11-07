import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { formatSoles } from "../../../../../core/utils/money";
import { isOutOfWriteScope, WriteScope } from "../../../../../core/rbac/writeScope";
import { beginCashChange } from "../../../../../core/money/cashPeriod";
import { nowUtc, toDateOnlyString } from "../../../../../utils/dateUtils";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { resolvePaymentAccountId } from "../../../variable_general/services/shared/payment_account.service";
import { CashMovementModel } from "../../model/cash_movement.model";
import { recordMoneyCorrection } from "../../../money_correction/services/create/money_correction.service";
import { MoneyCorrectionKind, MoneyCorrectionValues } from "../../../money_correction/types/money_correction.types";
import {
  applyRequested,
  assertHasChanges,
  changedFieldsBetween,
  pickFields,
  toMoneyValue,
  toNullableId,
  toNullableText,
} from "../../../money_correction/services/shared/correction_diff";
import { cashChangeNote } from "./cash_change_note";

// Campos de un movimiento manual que se pueden corregir. `direction` NO está a
// propósito: un ingreso que en realidad era un egreso es otro movimiento
// (se anula y se registra el correcto) — ver README del módulo.
export const CORRECTABLE_CASH_MOVEMENT_FIELDS = [
  "amount",
  "category",
  "occurred_at",
  "payment_account_id",
  "operation_number",
  "description",
  "quotation_id",
  "purchase_order_id",
] as const;

export type CorrectableCashMovementField = (typeof CORRECTABLE_CASH_MOVEMENT_FIELDS)[number];

// Campos a corregir. `undefined` (ausente en el body) = se queda como está;
// `null` en un campo opcional = se limpia (ej. pasar a efectivo, quitar el
// vínculo a una cotización). El validator ya revisó la forma de cada uno.
export interface CorrectCashMovementInput {
  amount?: number | string;
  category?: string;
  occurred_at?: string;
  payment_account_id?: number | string | null;
  operation_number?: string | null;
  description?: string | null;
  quotation_id?: number | string | null;
  purchase_order_id?: number | string | null;
  reason: string;
}

export interface CorrectCashMovementResult {
  id: number;
  correction_id: number;
  changed_fields: CorrectableCashMovementField[];
  // 'adjustment' = el movimiento era de un mes cerrado y la diferencia se
  // registró como ajuste en el mes abierto (adjusted_period = ese mes).
  kind: MoneyCorrectionKind;
  adjusted_period: string | null;
}

// Valores "limpios" de los campos corregibles, para comparar antes/después
// sin falsos cambios (10 vs "10.00", "" vs null, Date vs "YYYY-MM-DD").
type CorrectableSnapshot = {
  amount: number;
  category: string;
  occurred_at: string;
  payment_account_id: number | null;
  operation_number: string | null;
  description: string | null;
  quotation_id: number | null;
  purchase_order_id: number | null;
};

const snapshotOf = (movement: CashMovementModel): CorrectableSnapshot => ({
  amount: toMoneyValue(movement.amount),
  category: movement.category,
  occurred_at: toDateOnlyString(movement.occurred_at),
  payment_account_id: toNullableId(movement.payment_account_id),
  operation_number: toNullableText(movement.operation_number),
  description: toNullableText(movement.description),
  quotation_id: toNullableId(movement.quotation_id),
  purchase_order_id: toNullableId(movement.purchase_order_id),
});

// Valores pedidos, completando con los actuales lo que no vino en el body.
const requestedSnapshot = (current: CorrectableSnapshot, input: CorrectCashMovementInput): CorrectableSnapshot =>
  applyRequested(current, {
    amount: input.amount === undefined ? undefined : toMoneyValue(input.amount),
    category: input.category === undefined ? undefined : input.category.trim(),
    occurred_at: input.occurred_at,
    payment_account_id: input.payment_account_id === undefined ? undefined : toNullableId(input.payment_account_id),
    operation_number: input.operation_number === undefined ? undefined : toNullableText(input.operation_number),
    description: input.description === undefined ? undefined : toNullableText(input.description),
    quotation_id: input.quotation_id === undefined ? undefined : toNullableId(input.quotation_id),
    purchase_order_id: input.purchase_order_id === undefined ? undefined : toNullableId(input.purchase_order_id),
  });

// Categoría del catálogo de Caja (cash_movement_type), global o de la
// empresa, activa — misma regla que una deuda manual. Solo se revisa si
// cambió: mantener una categoría que se deshabilitó después no bloquea
// corregir, por ejemplo, el monto.
const assertCategoryAvailable = async (category: string, companyId: number, transaction: Transaction) => {
  const found = await DataBase.instance.variable_general.findOne({
    where: {
      category: "cash_movement_type",
      prefix_id: category,
      is_deleted: false,
      company_id: { [Op.or]: [companyId, null] },
    },
    transaction,
  });
  if (!found) throw new AppError(400, "La categoría seleccionada no existe o está deshabilitada");
};

// Mismo criterio que al crear (createCashMovementController): la cotización y
// la orden son contexto opcional, pero tienen que ser de la empresa del
// movimiento.
const assertQuotationBelongs = async (quotationId: number, companyId: number, transaction: Transaction) => {
  const quotation = await DataBase.instance.quotation.findOne({ where: { id: quotationId }, transaction });
  if (quotation?.company_id === companyId) return;
  throw new AppError(403, "La cotización seleccionada no pertenece a esta empresa");
};

const assertPurchaseOrderBelongs = async (purchaseOrderId: number, companyId: number, transaction: Transaction) => {
  const purchaseOrder = await DataBase.instance.purchase_order.findOne({ where: { id: purchaseOrderId }, transaction });
  if (purchaseOrder?.company_id === companyId) return;
  throw new AppError(403, "La orden de compra seleccionada no pertenece a esta empresa");
};

// Valida solo lo que cambió. La cuenta nueva usa el mismo validador que al
// crear (de la empresa y activa); conservar la misma cuenta no se revalida,
// así se puede corregir el monto de un movimiento viejo aunque su cuenta se
// haya deshabilitado después (mismo criterio que la edición de un pago).
const validateChanges = async (
  changed: CorrectableCashMovementField[],
  next: CorrectableSnapshot,
  companyId: number,
  transaction: Transaction
) => {
  if (changed.includes("category")) await assertCategoryAvailable(next.category, companyId, transaction);
  if (changed.includes("payment_account_id") && next.payment_account_id !== null) {
    await resolvePaymentAccountId({ accountId: next.payment_account_id, companyId, required: false, transaction });
  }
  if (changed.includes("quotation_id") && next.quotation_id !== null) {
    await assertQuotationBelongs(next.quotation_id, companyId, transaction);
  }
  if (changed.includes("purchase_order_id") && next.purchase_order_id !== null) {
    await assertPurchaseOrderBelongs(next.purchase_order_id, companyId, transaction);
  }
};

const accountNameOf = async (accountId: number | null, transaction: Transaction): Promise<string | null> => {
  if (accountId === null) return null;
  const account = await DataBase.instance.variable_general.findOne({ where: { id: accountId }, transaction });
  return account?.name ?? null;
};

// Foto (solo de lo que cambió) que va al historial. Con la cuenta se guarda
// también su nombre de ese momento.
const buildValues = async (
  snapshot: CorrectableSnapshot,
  changed: CorrectableCashMovementField[],
  transaction: Transaction
): Promise<MoneyCorrectionValues> => {
  const values: MoneyCorrectionValues = pickFields(snapshot, changed);
  if (!changed.includes("payment_account_id")) return values;
  return { ...values, payment_account_name: await accountNameOf(snapshot.payment_account_id, transaction) };
};

/**
 * Corrige un movimiento manual de Caja ("editar en el lugar + historial
 * inmutable", decidido con el usuario).
 *
 * Caja no guarda saldos: sus totales (y los de Estadísticas) se calculan en
 * vivo desde cash_movement (ver services/shared/cash_flow.sql.ts). Por eso
 * corregir la fila es suficiente para que todo cuadre: el monto viejo deja
 * de sumar y el nuevo suma una sola vez, en la cuenta y fecha corregidas.
 *
 * Todo en UNA transacción, con la fila bloqueada (FOR UPDATE) para que una
 * corrección y una anulación simultáneas no lean el mismo estado previo: el
 * cambio, la fila del historial (money_correction, fuente "manual") y el log. Si
 * cualquier paso falla, no queda nada aplicado.
 */
const correctCashMovementById = async ({
  movementId,
  input,
  scope,
  updatedBy,
}: {
  movementId: number;
  input: CorrectCashMovementInput;
  scope: WriteScope;
  updatedBy: number;
}): Promise<CorrectCashMovementResult> => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const movement = await DataBase.instance.cash_movement.findOne({
      where: { id: movementId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!movement || isOutOfWriteScope(movement, scope)) throw new AppError(404, "El movimiento no existe");
    // Uno anulado no suma en Caja: corregirlo no cambiaría nada y dejaría un
    // historial confuso. Primero se reactiva.
    if (movement.is_deleted) {
      throw new AppError(
        409,
        "Este movimiento está anulado: reactívalo antes de corregirlo",
        undefined,
        "CASH_MOVEMENT_ANNULLED"
      );
    }

    const previous = snapshotOf(movement);
    const next = requestedSnapshot(previous, input);
    const changed = changedFieldsBetween(CORRECTABLE_CASH_MOVEMENT_FIELDS, previous, next);
    assertHasChanges(changed);

    await validateChanges(changed, next, movement.company_id, transaction);

    // Cierre mensual de caja (fase 2): la fecha nueva nunca puede caer en un
    // mes cerrado (409). Si el movimiento ES de un mes cerrado, la corrección
    // se aplica igual en el lugar y, si cambia su efecto en caja (monto,
    // cuenta, fecha), se registra como ajuste con dos patas (complete).
    const change = await beginCashChange({
      companyId: movement.company_id,
      source: "manual",
      sourceId: movementId,
      oldDate: previous.occurred_at,
      newDate: next.occurred_at,
      movesCashAfter: true,
      scope,
      actorId: updatedBy,
      transaction,
    });

    const now = nowUtc();
    // Nunca se tocan created_by/created_at; updated_* siempre. Se escriben los
    // valores ya normalizados de los campos corregibles (los que no cambiaron
    // conservan su valor).
    await DataBase.instance.cash_movement.update(
      { ...next, updated_by: updatedBy, updated_at: now },
      { where: { id: movementId }, transaction }
    );

    // El historial siempre se registra; complete() le da el kind
    // ('adjustment' si se crearon patas de un mes cerrado).
    let correctionId = 0;
    const cash = await change.complete(async (kind) => {
      const correction = await recordMoneyCorrection({
        sourceType: "manual",
        sourceId: movementId,
        companyId: movement.company_id,
        businessUnitId: movement.business_unit_id,
        previous: await buildValues(previous, changed, transaction),
        next: await buildValues(next, changed, transaction),
        reason: input.reason,
        actorId: updatedBy,
        kind,
        transaction,
      });
      correctionId = correction.id;
      return correction.id;
    });

    const direction = movement.direction === "income" ? "ingreso" : "egreso";
    const amountNote =
      previous.amount === next.amount
        ? formatSoles(next.amount)
        : `${formatSoles(previous.amount)} → ${formatSoles(next.amount)}`;
    await createLogService(
      {
        user_id: updatedBy,
        action: LogAction.UPDATE,
        module: "cash_movement",
        description: `Corrigió el ${direction} #${movementId} (${amountNote}; campos: ${changed.join(", ")})${cashChangeNote(cash)}. Motivo: ${input.reason.trim()}`,
        company_id: movement.company_id,
      },
      transaction
    );

    return {
      id: movementId,
      correction_id: correctionId,
      changed_fields: changed,
      kind: cash.kind,
      adjusted_period: cash.adjustedPeriod,
    };
  });
};

export { correctCashMovementById };
