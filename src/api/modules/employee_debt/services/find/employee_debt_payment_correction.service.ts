import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { PaginatedResult } from "../../../../../core/utils/paginate";
import { listMoneyCorrections } from "../../../money_correction/services/find/money_correction.service";
import { MoneyCorrectionListItem } from "../../../money_correction/types/money_correction.types";

/**
 * GET /employee-debt/payment/:id/corrections — historial de correcciones de
 * una reposición (monto, fecha, cuenta y reparto entre deudas). Mismo
 * alcance de LECTURA que el listado de reposiciones (empresa de la sesión).
 */
const getEmployeeDebtPaymentCorrections = async ({
  paymentId,
  companyId,
  page,
  limit,
}: {
  paymentId: number;
  companyId: number | null;
  page: number;
  limit: number;
}): Promise<PaginatedResult<MoneyCorrectionListItem>> => {
  const payment = await DataBase.instance.employee_debt_payment.findOne({
    where: { id: paymentId },
    attributes: ["id", "company_id"],
  });
  if (!payment || (companyId !== null && Number(payment.company_id) !== companyId)) {
    throw new AppError(404, "La reposición no existe");
  }

  return listMoneyCorrections({ sourceType: "employee_debt_payment", sourceId: paymentId, page, limit });
};

export { getEmployeeDebtPaymentCorrections };
