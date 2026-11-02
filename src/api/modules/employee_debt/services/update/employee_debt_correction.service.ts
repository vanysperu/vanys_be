import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { formatSoles, toCents } from "../../../../../core/utils/money";
import { nowUtc, toDateOnlyString } from "../../../../../utils/dateUtils";
import { isOutOfWriteScope, WriteScope } from "../../../../../core/rbac/writeScope";
import { assertCashPeriodOpen } from "../../../../../core/money/cashPeriod";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { recordMoneyCorrection } from "../../../money_correction/services/create/money_correction.service";
import { MoneyCorrectionValues } from "../../../money_correction/types/money_correction.types";
import {
  applyRequested,
  assertHasChanges,
  changedFieldsBetween,
  CorrectionSnapshot,
  pickFields,
  toMoneyValue,
  toNullableId,
  toNullableText,
} from "../../../money_correction/services/shared/correction_diff";
import { EmployeeDebtAttributes, EmployeeDebtModel } from "../../model/employee_debt.model";
import { recalculateDebtsState } from "../shared/debt_state.service";
import { assertExpenseCategory } from "../shared/expense_category.service";

// Campos corregibles de una deuda MANUAL. El origen, la empresa y lo
// repuesto no se corrigen nunca (lo repuesto se corrige desde la reposición).
export const CORRECTABLE_MANUAL_DEBT_FIELDS = [
  "amount",
  "description",
  "category",
  "incurred_at",
  "business_unit_id",
  "user_id",
] as const;

export type CorrectableManualDebtField = (typeof CORRECTABLE_MANUAL_DEBT_FIELDS)[number];

type ManualDebtSnapshot = CorrectionSnapshot<CorrectableManualDebtField>;

// `undefined` = se queda como está; business_unit_id null = sin tienda.
export interface CorrectManualDebtInput {
  amount?: number | string;
  description?: string;
  category?: string;
  incurred_at?: string;
  business_unit_id?: number | string | null;
  user_id?: number | string;
  reason: string;
}

export interface CorrectManualDebtResult {
  id: number;
  correction_id: number;
  changed_fields: CorrectableManualDebtField[];
  status: EmployeeDebtModel["status"];
}

const NOT_FOUND_MESSAGE = "La deuda no existe";

const snapshotOf = (debt: EmployeeDebtModel): ManualDebtSnapshot => ({
  amount: toMoneyValue(debt.amount),
  description: toNullableText(debt.description),
  category: toNullableText(debt.category),
  incurred_at: toDateOnlyString(debt.incurred_at),
  business_unit_id: toNullableId(debt.business_unit_id),
  user_id: Number(debt.user_id),
});

const requestedOf = (input: CorrectManualDebtInput): Partial<ManualDebtSnapshot> => ({
  amount: input.amount === undefined ? undefined : toMoneyValue(input.amount),
  description: input.description === undefined ? undefined : toNullableText(input.description),
  category: input.category === undefined ? undefined : toNullableText(input.category),
  incurred_at: input.incurred_at,
  business_unit_id: input.business_unit_id === undefined ? undefined : toNullableId(input.business_unit_id),
  user_id: input.user_id === undefined ? undefined : Number(input.user_id),
});

// Columnas a actualizar, ya con el tipo de la tabla (solo lo que cambió).
type DebtColumns = Pick<
  EmployeeDebtAttributes,
  "amount" | "description" | "category" | "incurred_at" | "business_unit_id" | "user_id"
>;

const debtChangesOf = (next: ManualDebtSnapshot, changed: readonly CorrectableManualDebtField[]): Partial<DebtColumns> => {
  const columns: DebtColumns = {
    amount: Number(next.amount),
    description: next.description === null ? null : String(next.description),
    category: next.category === null ? null : String(next.category),
    incurred_at: String(next.incurred_at),
    business_unit_id: toNullableId(next.business_unit_id),
    user_id: Number(next.user_id),
  };
  return changed.reduce<Partial<DebtColumns>>((picked, field) => ({ ...picked, [field]: columns[field] }), {});
};

// Nuevo trabajador: solo mientras no se le haya repuesto nada (si no, lo ya
// devuelto quedaría a nombre de otra persona), activo y de la misma empresa.
const assertNewCreditor = async (debt: EmployeeDebtModel, userId: number, transaction: Transaction) => {
  if (toCents(debt.paid_amount) > 0) {
    throw new AppError(
      409,
      `Ya se le repuso ${formatSoles(debt.paid_amount)} de esta deuda: no se puede cambiar el trabajador. Anula primero esa reposición.`,
      undefined,
      "DEBT_REIMBURSED"
    );
  }
  const employee = await DataBase.instance.user.findOne({ where: { id: userId }, transaction });
  const available = employee !== null && employee.company_id === debt.company_id && employee.status && !employee.is_deleted;
  if (available) return;
  throw new AppError(
    400,
    "El trabajador seleccionado no está disponible (deshabilitado o de otra empresa)",
    undefined,
    "EMPLOYEE_NOT_AVAILABLE"
  );
};

// Tienda nueva: de la misma empresa de la deuda y, para un usuario ligado a
// una tienda, solo la suya (alcance de escritura).
const assertNewBusinessUnit = async (
  debt: EmployeeDebtModel,
  businessUnitId: number | null,
  scope: WriteScope,
  transaction: Transaction
) => {
  if (isOutOfWriteScope({ company_id: debt.company_id, business_unit_id: businessUnitId }, scope)) {
    throw new AppError(403, "Solo puedes dejar la deuda en tu propia tienda");
  }
  if (businessUnitId === null) return;
  const businessUnit = await DataBase.instance.business_unit.findOne({ where: { id: businessUnitId }, transaction });
  if (!businessUnit) throw new AppError(404, "La tienda seleccionada no existe");
  if (businessUnit.company_id !== debt.company_id) throw new AppError(403, "La tienda seleccionada no pertenece a esta empresa");
};

const validateChanges = async (
  debt: EmployeeDebtModel,
  changed: CorrectableManualDebtField[],
  next: ManualDebtSnapshot,
  scope: WriteScope,
  transaction: Transaction
) => {
  if (changed.includes("amount") && toCents(Number(next.amount)) < toCents(debt.paid_amount)) {
    throw new AppError(
      409,
      `Ya se le repuso ${formatSoles(debt.paid_amount)} de esta deuda; el monto no puede quedar por debajo. Corrige o anula primero la reposición.`,
      undefined,
      "DEBT_BELOW_REIMBURSED"
    );
  }
  if (changed.includes("description") && String(next.description ?? "").length < 3) {
    throw new AppError(400, "Describe qué se pagó (mínimo 3 caracteres)");
  }
  if (changed.includes("category")) {
    if (next.category === null) throw new AppError(400, "Selecciona la categoría del gasto");
    await assertExpenseCategory(String(next.category), debt.company_id, transaction);
  }
  if (changed.includes("user_id")) await assertNewCreditor(debt, Number(next.user_id), transaction);
  if (changed.includes("business_unit_id")) {
    await assertNewBusinessUnit(debt, toNullableId(next.business_unit_id), scope, transaction);
  }
};

const userNameOf = async (userId: number, transaction: Transaction): Promise<string | null> => {
  const user = await DataBase.instance.user.findOne({ where: { id: userId }, transaction });
  return user ? `${user.name} ${user.paternal_lastname}` : null;
};

const businessUnitNameOf = async (businessUnitId: number | null, transaction: Transaction): Promise<string | null> => {
  if (businessUnitId === null) return null;
  const businessUnit = await DataBase.instance.business_unit.findOne({ where: { id: businessUnitId }, transaction });
  return businessUnit?.business_code ?? null;
};

// Foto del historial: solo lo que cambió, con los nombres del momento
// (trabajador, tienda) y el estado de la deuda si cambió (ej. al subir el
// monto, una deuda "pagada" vuelve a "pendiente").
const buildValues = async (
  snapshot: ManualDebtSnapshot,
  changed: CorrectableManualDebtField[],
  status: string | null,
  transaction: Transaction
): Promise<MoneyCorrectionValues> => {
  const values: MoneyCorrectionValues = pickFields(snapshot, changed);
  const withUser = changed.includes("user_id")
    ? { ...values, user_name: await userNameOf(Number(snapshot.user_id), transaction) }
    : values;
  const withStore = changed.includes("business_unit_id")
    ? { ...withUser, business_unit_name: await businessUnitNameOf(toNullableId(snapshot.business_unit_id), transaction) }
    : withUser;
  return status === null ? withStore : { ...withStore, debt_status: status };
};

/**
 * Corrige una deuda MANUAL con un trabajador, en el lugar y con historial
 * inmutable (money_correction, fuente "employee_debt").
 *
 * Una deuda no mueve Caja (la fila de Caja es informativa): corregirla no
 * cambia ningún total de Caja, solo lo pendiente de reponer.
 *
 * Bloqueo: solo la deuda (FOR UPDATE). Lo repuesto, el estado y la fecha del
 * último abono se recalculan desde la fuente (recalculateDebtsState), con el
 * monto nuevo ya guardado. Las deudas de compras no se corrigen acá: se
 * corrigen desde la compra (su monto está copiado en la compra y su gasto).
 */
const correctManualEmployeeDebt = async ({
  debtId,
  input,
  scope,
  actorId,
}: {
  debtId: number;
  input: CorrectManualDebtInput;
  scope: WriteScope;
  actorId: number;
}): Promise<CorrectManualDebtResult> => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const debt = await DataBase.instance.employee_debt.findOne({
      where: { id: debtId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!debt) throw new AppError(404, NOT_FOUND_MESSAGE);
    // Para una deuda manual su tienda es la propia (las de compras se
    // rechazan justo abajo).
    if (isOutOfWriteScope({ company_id: debt.company_id, business_unit_id: debt.business_unit_id }, scope)) {
      throw new AppError(404, NOT_FOUND_MESSAGE);
    }
    if (debt.origin !== "manual") {
      throw new AppError(
        409,
        "Esta deuda viene de una compra de orden: se corrige desde la compra (en su orden de compra o en Caja).",
        undefined,
        "DEBT_FROM_PURCHASE"
      );
    }
    if (debt.status === "cancelled") {
      throw new AppError(409, "Esta deuda está anulada: registra una nueva", undefined, "DEBT_CANCELLED");
    }

    const previous = snapshotOf(debt);
    const next = applyRequested(previous, requestedOf(input));
    const changed = changedFieldsBetween(CORRECTABLE_MANUAL_DEBT_FIELDS, previous, next);
    assertHasChanges(changed);

    await validateChanges(debt, changed, next, scope, transaction);

    // Cierre de caja (fase 2): la fecha vieja y la nueva (no mueve caja).
    for (const date of new Set([String(previous.incurred_at), String(next.incurred_at)])) {
      await assertCashPeriodOpen({ companyId: debt.company_id, date, source: "employee_debt", movesCash: false, transaction });
    }

    const previousStatus = debt.status;
    // Nunca se tocan created_by/created_at; updated_* siempre.
    await debt.update({ ...debtChangesOf(next, changed), updated_by: actorId, updated_at: nowUtc() }, { transaction });
    await recalculateDebtsState([debtId], transaction, actorId);
    await debt.reload({ transaction });
    const statusChanged = debt.status !== previousStatus;

    const correction = await recordMoneyCorrection({
      sourceType: "employee_debt",
      sourceId: debtId,
      companyId: debt.company_id,
      businessUnitId: toNullableId(next.business_unit_id),
      previous: await buildValues(previous, changed, statusChanged ? previousStatus : null, transaction),
      next: await buildValues(next, changed, statusChanged ? debt.status : null, transaction),
      reason: input.reason,
      actorId,
      transaction,
    });

    const amountNote =
      previous.amount === next.amount
        ? formatSoles(Number(next.amount))
        : `${formatSoles(Number(previous.amount))} → ${formatSoles(Number(next.amount))}`;
    await createLogService(
      {
        user_id: actorId,
        action: LogAction.UPDATE,
        module: "employee_debt",
        description: `Corrigió la deuda manual #${debtId} (${amountNote}; campos: ${changed.join(", ")}). Motivo: ${input.reason.trim()}`,
        company_id: debt.company_id,
      },
      transaction
    );

    return { id: debtId, correction_id: correction.id, changed_fields: changed, status: debt.status };
  });
};

export { correctManualEmployeeDebt };
