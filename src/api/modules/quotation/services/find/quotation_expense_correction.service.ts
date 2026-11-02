import { IToken } from "../../../../interfaces/IToken.interface";
import { AppError } from "../../../../../core/errors/AppError";
import { PaginatedResult } from "../../../../../core/utils/paginate";
import { listMoneyCorrections } from "../../../money_correction/services/find/money_correction.service";
import { MoneyCorrectionListItem } from "../../../money_correction/types/money_correction.types";
import { isOutOfReadScope } from "../shared/quotation_scope";
import { findQuotationExpenseById } from "./quotation_expense.service";

/**
 * Historial de correcciones de un gasto (manual o de una compra: la compra se
 * guarda con la fuente "quotation_expense" y el id de su gasto). Es lectura:
 * alcance de lectura de la cotización; fuera de él responde 404.
 */
export async function listQuotationExpenseCorrections({
  expenseId,
  user,
  page,
  limit,
}: {
  expenseId: number;
  user: IToken;
  page: number;
  limit: number;
}): Promise<PaginatedResult<MoneyCorrectionListItem>> {
  const expense = await findQuotationExpenseById(expenseId);
  if (!expense || isOutOfReadScope(expense, user)) throw new AppError(404, "El gasto no existe");

  return listMoneyCorrections({ sourceType: "quotation_expense", sourceId: expenseId, page, limit });
}
