import { literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import {
  assertPaymentWithinBalance,
  recalculateTotalPaid,
} from "../../../quotation/services/create/quotation_payment.service";
import { logQuotationEvent } from "../../../quotation/services/timeline/quotation_event.service";

// Anular/restaurar un pago (toggle, mismo patrón que cash_movement) — al
// anularlo, recalculateTotalPaid ya lo excluye de la suma (is_deleted=false
// en el WHERE); al restaurarlo, vuelve a sumarse solo.
const disableOrEnablePaymentById = async ({ paymentId, updatedBy }: { paymentId: number; updatedBy?: number }) => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // Fila bloqueada: dos toggles simultáneos no leen el mismo estado previo.
    const payment = await DataBase.instance.quotation_payment.findOne({
      where: { id: paymentId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!payment) throw new Error("El pago no existe");

    // Restaurar vuelve a sumar el pago: pasa por las mismas reglas que uno
    // nuevo — antes se podía dejar la cotización sobre-pagada, o con dinero
    // estando ya cerrada, solo con reactivar un pago anulado.
    if (payment.is_deleted) {
      await assertPaymentWithinBalance({
        quotationId: payment.quotation_id,
        amount: Number(payment.amount),
        excludePaymentId: paymentId,
        transaction,
      });
    }

    await DataBase.instance.quotation_payment.update(
      {
        is_deleted: literal("CASE WHEN is_deleted = true THEN false ELSE true END"),
        updated_by: updatedBy,
        updated_at: nowUtc(),
      },
      { where: { id: paymentId }, transaction }
    );

    await recalculateTotalPaid(payment.quotation_id, transaction);

    await logQuotationEvent({
      quotationId: payment.quotation_id,
      action: "payment_disabled",
      description: `Pago #${paymentId} ${payment.is_deleted ? "restaurado" : "anulado"}`,
      actorId: updatedBy,
      transaction,
    });

    return DataBase.instance.quotation_payment.findOne({ where: { id: paymentId }, transaction });
  });
};

export { disableOrEnablePaymentById };
