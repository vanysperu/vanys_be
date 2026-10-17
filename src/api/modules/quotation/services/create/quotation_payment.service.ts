import { Op, QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { logQuotationEvent } from "../timeline/quotation_event.service";

// Tolerancia de un céntimo para absorber artefactos de redondeo decimal
// (ver computeQuotationTotal) — nunca para disfrazar un sobre-pago real.
const OVERPAY_TOLERANCE = 0.01;

export class PaymentExceedsBalanceError extends Error {}

// Antes no existía NINGÚN tope: se podía registrar/editar un pago por
// cualquier monto, dejando `total_paid` por encima de `quotation.total` sin
// que el sistema avisara — típicamente un error de tipeo (ej. S/5,000 en vez
// de S/500) que nadie notaba hasta una auditoría manual. `excludePaymentId`
// es para editar un pago existente: su propio monto viejo no debe contar
// dos veces contra el tope. El `lock: FOR UPDATE` sobre `quotation` de paso
// sirve de defensa adicional contra la misma condición de carrera que
// recalculateTotalPaid ya resuelve con su UPDATE atómico.
const assertPaymentWithinBalance = async ({
  quotationId,
  amount,
  excludePaymentId,
  transaction,
}: {
  quotationId: number;
  amount: number;
  excludePaymentId?: number;
  transaction: Transaction;
}) => {
  const quotation = await DataBase.instance.quotation.findOne({
    where: { id: quotationId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!quotation) throw new Error("La cotización no existe");

  const where: Record<string, unknown> = { quotation_id: quotationId, is_deleted: false };
  if (excludePaymentId) where.id = { [Op.ne]: excludePaymentId };

  const existingTotal = Number((await DataBase.instance.quotation_payment.sum("amount", { where, transaction })) ?? 0);
  const projectedTotal = existingTotal + Number(amount);
  const total = Number(quotation.total);

  if (projectedTotal > total + OVERPAY_TOLERANCE) {
    const remaining = Math.max(total - existingTotal, 0);
    throw new PaymentExceedsBalanceError(
      `Este pago deja la cotización sobre-pagada — el saldo pendiente es S/ ${remaining.toFixed(2)}`
    );
  }
};

export interface CreateQuotationPaymentInput {
  amount: number;
  method?: string | null;
  paid_at: string;
  notes?: string | null;
  operation_number?: string | null;
}

// total_paid vive en la cotización como campo cacheado (evita sumar los
// pagos en cada listado del panel/kanban) — se recalcula desde la fuente
// de verdad (la tabla de pagos) cada vez que se agrega uno, nunca se
// incrementa a mano para no arrastrar un desfase si algún pago se corrige.
//
// Una sola sentencia atómica (UPDATE ... SET x = (SELECT SUM...) WHERE id),
// NUNCA "leer el SUM con una query y escribirlo con otra" — con dos pasos
// separados, dos pagos creados/editados/anulados casi al mismo tiempo sobre
// la MISMA cotización pueden pisarse (lost update: la transacción B lee el
// total antes de que A confirme su INSERT, y la escritura de B sobre-escribe
// la de A con un total que no incluye el pago de A). Al ser una sola
// sentencia, el lock de fila de InnoDB sobre `quotation` serializa las
// transacciones concurrentes: la segunda espera a que la primera confirme y
// su propio SELECT interno ya ve el INSERT/UPDATE ya comprometido.
const recalculateTotalPaid = async (quotationId: number, transaction: Transaction) => {
  await DataBase.instance.sequelize.query(
    `UPDATE quotation
     SET total_paid = (
       SELECT COALESCE(SUM(amount), 0) FROM quotation_payment
       WHERE quotation_id = :quotationId AND is_deleted = false
     )
     WHERE id = :quotationId`,
    { type: QueryTypes.UPDATE, replacements: { quotationId }, transaction }
  );
};

// Escribe en 3 tablas (quotation_payment, quotation, quotation_event) — se
// envuelve en una transacción para que un fallo a mitad de camino no deje
// el total_paid cacheado desincronizado del pago real.
const createQuotationPayment = async ({
  quotationId,
  input,
  createdBy,
}: {
  quotationId: number;
  input: CreateQuotationPaymentInput;
  createdBy?: number;
}) => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    await assertPaymentWithinBalance({ quotationId, amount: input.amount, transaction });

    const payment = await DataBase.instance.quotation_payment.create(
      {
        id: 0,
        quotation_id: quotationId,
        amount: input.amount,
        method: input.method ?? null,
        paid_at: input.paid_at,
        notes: input.notes ?? null,
        operation_number: input.operation_number ?? null,
        is_deleted: false,
        created_by: createdBy ?? null,
        created_at: nowUtc(),
        updated_by: null,
        updated_at: null,
      },
      { transaction }
    );

    await recalculateTotalPaid(quotationId, transaction);

    await logQuotationEvent({
      quotationId,
      action: "payment_added",
      description: `Pago registrado por S/ ${Number(input.amount).toFixed(2)}`,
      actorId: createdBy,
      transaction,
    });

    return payment;
  });
};

export { createQuotationPayment, recalculateTotalPaid, assertPaymentWithinBalance };
