import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { assertPaymentWithinBalance, recalculateTotalPaid } from "../../../quotation/services/create/quotation_payment.service";
import { logQuotationEvent } from "../../../quotation/services/timeline/quotation_event.service";

export interface UpdatePaymentInput {
  amount: number;
  method: string;
  paid_at: string;
  notes?: string | null;
  operation_number?: string | null;
}

// Un pago editado puede cambiar de monto — total_paid de la cotización
// SIEMPRE se recalcula desde la fuente de verdad (nunca se suma/resta a
// mano la diferencia), mismo criterio que al crear/anular un pago.
const updatePaymentById = async ({
  paymentId,
  input,
  updatedBy,
}: {
  paymentId: number;
  input: UpdatePaymentInput;
  updatedBy?: number;
}) => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const payment = await DataBase.instance.quotation_payment.findOne({ where: { id: paymentId }, transaction });
    if (!payment) throw new Error("El pago no existe");

    await assertPaymentWithinBalance({
      quotationId: payment.quotation_id,
      amount: input.amount,
      excludePaymentId: paymentId,
      transaction,
    });

    await DataBase.instance.quotation_payment.update(
      {
        amount: input.amount,
        method: input.method,
        paid_at: input.paid_at,
        notes: input.notes ?? null,
        operation_number: input.operation_number ?? null,
        updated_by: updatedBy ?? null,
        updated_at: nowUtc(),
      },
      { where: { id: paymentId }, transaction }
    );

    await recalculateTotalPaid(payment.quotation_id, transaction);

    await logQuotationEvent({
      quotationId: payment.quotation_id,
      action: "payment_updated",
      description: `Pago #${paymentId} editado — nuevo monto S/ ${Number(input.amount).toFixed(2)}`,
      actorId: updatedBy,
      transaction,
    });

    return DataBase.instance.quotation_payment.findOne({ where: { id: paymentId }, transaction });
  });
};

export { updatePaymentById };
