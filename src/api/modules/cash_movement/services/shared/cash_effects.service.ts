import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { toCents } from "../../../../../core/utils/money";
import { toDateOnlyString } from "../../../../../utils/dateUtils";
import { MoneyCorrectionSource } from "../../../money_correction/types/money_correction.types";
import { CashDirection, CashEffect } from "../../../cash_closing/types/cash_closing.types";
import {
  EXPENSE_ACTIVE_SQL,
  EXPENSE_FUNDING_JOIN_SQL,
  EXPENSE_PAID_BY_COMPANY_SQL,
  REIMBURSEMENT_ALLOCATIONS_FROM_SQL,
} from "./cash_flow.sql";

// Efecto en caja de UNA fila de Caja (o de cada asignación de una
// reposición), exactamente como lo cuenta el listado de Caja: mismos
// fragmentos de cash_flow.sql.ts, filtrados por id. Lo usa el cierre de caja
// para comparar "antes" y "después" de corregir/anular/restaurar una fila
// (core/money/cashPeriod.ts → beginCashChange/complete).
//
// LOCK IN SHARE MODE a propósito: los services suelen leer la fila sin lock
// antes de bloquearla (peek), y eso fija la foto de REPEATABLE READ. Sin una
// lectura con lock, "antes" podría ser una versión vieja y el mes cerrado
// quedaría descuadrado sin que nadie lo note.

interface RawEffectRow {
  date: string | Date;
  direction: CashDirection;
  amount: string | number;
  payment_account_id: number | string | null;
  business_unit_id: number | string | null;
  quotation_id: number | string | null;
  purchase_order_id: number | string | null;
}

const toNullableNumber = (value: number | string | null): number | null => (value === null ? null : Number(value));

const toEffect = (row: RawEffectRow): CashEffect => ({
  date: toDateOnlyString(row.date),
  direction: row.direction,
  amountCents: toCents(row.amount),
  paymentAccountId: toNullableNumber(row.payment_account_id),
  businessUnitId: toNullableNumber(row.business_unit_id),
  quotationId: toNullableNumber(row.quotation_id),
  purchaseOrderId: toNullableNumber(row.purchase_order_id),
});

// Movimiento manual vigente.
const MANUAL_EFFECTS_SQL = `
  SELECT cm.occurred_at AS date, cm.direction, cm.amount, cm.payment_account_id, cm.business_unit_id,
         cm.quotation_id, cm.purchase_order_id
  FROM cash_movement cm
  WHERE cm.id = :sourceId AND cm.is_deleted = false
  LOCK IN SHARE MODE`;

// Pago de cliente vigente (la tienda es la de su cotización).
const PAYMENT_EFFECTS_SQL = `
  SELECT qp.paid_at AS date, 'income' AS direction, qp.amount, qp.payment_account_id, q.business_unit_id,
         qp.quotation_id, NULL AS purchase_order_id
  FROM quotation_payment qp
  INNER JOIN quotation q ON q.id = qp.quotation_id
  WHERE qp.id = :sourceId AND qp.is_deleted = false
  LOCK IN SHARE MODE`;

// Gasto vigente (manual o compra) pagado por la empresa. Una compra pagada
// por un trabajador no mueve caja: no tiene efecto.
const EXPENSE_EFFECTS_SQL = `
  SELECT qe.spent_at AS date, 'expense' AS direction, qe.amount, qe.payment_account_id, q.business_unit_id,
         qe.quotation_id, poi.purchase_order_id
  FROM quotation_expense qe
  INNER JOIN quotation q ON q.id = qe.quotation_id
  ${EXPENSE_FUNDING_JOIN_SQL}
  LEFT JOIN purchase_order_item poi ON poi.id = fpop.purchase_order_item_id
  WHERE qe.id = :sourceId AND ${EXPENSE_ACTIVE_SQL} AND ${EXPENSE_PAID_BY_COMPANY_SQL}
  LOCK IN SHARE MODE`;

// Reposición vigente: una fila por asignación, con la tienda, cotización y
// orden de cada deuda (igual que Caja filtrada por tienda/cotización/orden).
const REIMBURSEMENT_EFFECTS_SQL = `
  SELECT p.paid_at AS date, 'expense' AS direction, a.amount, p.payment_account_id,
         COALESCE(rq.business_unit_id, ed.business_unit_id) AS business_unit_id,
         rq.id AS quotation_id, rpo.id AS purchase_order_id
  FROM ${REIMBURSEMENT_ALLOCATIONS_FROM_SQL}
  WHERE p.id = :sourceId AND p.is_deleted = false
  ORDER BY a.id
  LOCK IN SHARE MODE`;

// Una deuda manual nunca mueve caja (su egreso es la reposición).
const EFFECTS_SQL: Record<MoneyCorrectionSource, string | null> = {
  manual: MANUAL_EFFECTS_SQL,
  quotation_payment: PAYMENT_EFFECTS_SQL,
  quotation_expense: EXPENSE_EFFECTS_SQL,
  employee_debt: null,
  employee_debt_payment: REIMBURSEMENT_EFFECTS_SQL,
};

/**
 * Efectos en caja actuales de una fila (lista vacía si está anulada, si no
 * mueve caja o si no existe). `sourceId` = id de la fila de Caja (una compra
 * = su quotation_expense_id). Siempre dentro de la transacción del cambio.
 */
export async function loadCashEffects(
  source: MoneyCorrectionSource,
  sourceId: number,
  transaction: Transaction
): Promise<CashEffect[]> {
  const sql = EFFECTS_SQL[source];
  if (sql === null) return [];

  const rows = await DataBase.instance.sequelize.query<RawEffectRow>(sql, {
    type: QueryTypes.SELECT,
    replacements: { sourceId },
    transaction,
  });

  // Un monto 0 no mueve nada (defensa: las tablas ya exigen > 0).
  return rows.map(toEffect).filter((effect) => effect.amountCents !== 0);
}
