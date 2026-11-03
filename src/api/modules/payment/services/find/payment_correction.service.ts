import { AppError } from "../../../../../core/errors/AppError";
import { WriteScope } from "../../../../../core/rbac/writeScope";
import { PaginatedResult } from "../../../../../core/utils/paginate";
import { DataBase } from "../../../../../database";
import { listMoneyCorrections } from "../../../money_correction/services/find/money_correction.service";
import { MoneyCorrectionListItem } from "../../../money_correction/types/money_correction.types";
import { assertPaymentInWriteScope } from "../shared/payment_scope";

// Historial de correcciones de un pago (money_correction, fuente
// "quotation_payment"), más reciente primero. Es lectura: `scope` es el
// alcance de lectura (empresa y, si está limitado, tienda).
const getPaymentCorrections = async ({
  paymentId,
  scope,
  page,
  limit,
}: {
  paymentId: number;
  scope: WriteScope;
  page: number;
  limit: number;
}): Promise<PaginatedResult<MoneyCorrectionListItem>> => {
  const payment = await DataBase.instance.quotation_payment.findOne({ where: { id: paymentId } });
  const quotation = payment
    ? await DataBase.instance.quotation.findOne({ where: { id: payment.quotation_id } })
    : null;
  if (!quotation) throw new AppError(404, "El pago no existe");
  assertPaymentInWriteScope(quotation, scope);

  return listMoneyCorrections({ sourceType: "quotation_payment", sourceId: paymentId, page, limit });
};

export { getPaymentCorrections };
