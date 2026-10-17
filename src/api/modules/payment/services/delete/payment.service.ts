import { literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { recalculateTotalPaid } from "../../../quotation/services/create/quotation_payment.service";
import { logQuotationEvent } from "../../../quotation/services/timeline/quotation_event.service";

// Anular/restaurar un pago (toggle, mismo patrón que cash_movement) — al
// anularlo, recalculateTotalPaid ya lo excluye de la suma (is_deleted=false
// en el WHERE); al restaurarlo, vuelve a sumarse solo.
const disableOrEnablePaymentById = async ({ paymentId, updatedBy }: { paymentId: number; updatedBy?: number }) => {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const payment = await DataBase.instance.quotation_payment.findOne({ where: { id: paymentId }, transaction });
    if (!payment) throw new Error("El pago no existe");

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
