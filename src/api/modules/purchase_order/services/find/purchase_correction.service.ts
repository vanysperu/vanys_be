import { IToken } from "../../../../interfaces/IToken.interface";
import { AppError } from "../../../../../core/errors/AppError";
import { PaginatedResult } from "../../../../../core/utils/paginate";
import { listMoneyCorrections } from "../../../money_correction/services/find/money_correction.service";
import { MoneyCorrectionListItem } from "../../../money_correction/types/money_correction.types";
import { isOutOfReadScope } from "../../../quotation/services/shared/quotation_scope";
import { findPurchaseById } from "./purchase_order_item_purchase.service";

/**
 * Historial de correcciones de una compra. Se guarda con la fuente
 * "quotation_expense" y el id de SU gasto (la fila que muestra Caja), así el
 * mismo historial se ve desde la orden, desde la cotización y desde Caja. Es
 * lectura: alcance de lectura; fuera de él responde 404.
 */
export async function listPurchaseCorrections({
  purchaseId,
  user,
  page,
  limit,
}: {
  purchaseId: number;
  user: IToken;
  page: number;
  limit: number;
}): Promise<PaginatedResult<MoneyCorrectionListItem>> {
  const purchase = await findPurchaseById(purchaseId);
  if (!purchase || isOutOfReadScope(purchase, user)) throw new AppError(404, "La compra no existe");

  return listMoneyCorrections({ sourceType: "quotation_expense", sourceId: purchase.quotation_expense_id, page, limit });
}
