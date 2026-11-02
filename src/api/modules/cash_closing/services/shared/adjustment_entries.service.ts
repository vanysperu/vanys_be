import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { fromCents, toCents } from "../../../../../core/utils/money";
import { nowUtc } from "../../../../../utils/dateUtils";
import { MoneyCorrectionSource } from "../../../money_correction/types/money_correction.types";
import { AdjustmentLeg } from "../../types/cash_closing.types";

// Cálculo puro (sin base): ver adjustment_legs.ts.
export { cashEffectKey, netEffectCents, planAdjustmentLegs, planReleaseLegs } from "./adjustment_legs";

export interface InsertAdjustmentLegsInput {
  companyId: number;
  moneyCorrectionId: number; // padre kind='adjustment' (motivo + antes/después)
  source: MoneyCorrectionSource;
  sourceId: number; // id de la fila de Caja (compra = quotation_expense_id)
  legs: readonly AdjustmentLeg[];
  actorId: number;
  transaction: Transaction;
}

/**
 * Inserta las patas (inmutables) de un ajuste, en la MISMA transacción que la
 * corrección y su historial. Devuelve cuántas insertó.
 */
export async function insertAdjustmentLegs({
  companyId,
  moneyCorrectionId,
  source,
  sourceId,
  legs,
  actorId,
  transaction,
}: InsertAdjustmentLegsInput): Promise<number> {
  if (legs.length === 0) return 0;

  const now = nowUtc();
  const rows = legs.map((leg) => ({
    company_id: companyId,
    business_unit_id: leg.businessUnitId,
    money_correction_id: moneyCorrectionId,
    source_type: source,
    source_id: sourceId,
    leg: leg.leg,
    affected_period: leg.affectedPeriod,
    entry_date: leg.entryDate,
    direction: leg.direction,
    amount: fromCents(leg.amountCents),
    payment_account_id: leg.paymentAccountId,
    quotation_id: leg.quotationId,
    purchase_order_id: leg.purchaseOrderId,
    created_by: actorId,
    created_at: now,
    updated_by: actorId,
    updated_at: now,
  }));

  await DataBase.instance.cash_adjustment_entry.bulkCreate(rows, { transaction });
  return rows.length;
}

/**
 * Patas hold ya registradas de una fila en los meses dados (los REABIERTOS),
 * para poder liberarlas si la fila cambia su efecto en caja ahí
 * (planReleaseLegs). Las patas son inmutables y la fila ya está bloqueada por
 * el service, así que basta una lectura plana dentro de la transacción.
 */
export async function loadRowHolds(
  companyId: number,
  source: MoneyCorrectionSource,
  sourceId: number,
  periods: readonly string[],
  transaction: Transaction
): Promise<AdjustmentLeg[]> {
  if (periods.length === 0) return [];

  const rows = await DataBase.instance.cash_adjustment_entry.findAll({
    where: {
      company_id: companyId,
      source_type: source,
      source_id: sourceId,
      leg: "hold",
      affected_period: { [Op.in]: [...periods] },
    },
    order: [["id", "ASC"]],
    transaction,
  });

  const nullableId = (value: number | null): number | null => (value === null ? null : Number(value));
  return rows.map((row) => ({
    leg: row.leg,
    affectedPeriod: row.affected_period,
    entryDate: String(row.entry_date),
    direction: row.direction,
    amountCents: toCents(row.amount),
    paymentAccountId: nullableId(row.payment_account_id),
    businessUnitId: nullableId(row.business_unit_id),
    quotationId: nullableId(row.quotation_id),
    purchaseOrderId: nullableId(row.purchase_order_id),
  }));
}
