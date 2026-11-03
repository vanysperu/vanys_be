import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { PaginatedResult } from "../../../../../core/utils/paginate";
import { listMoneyCorrections } from "../../../money_correction/services/find/money_correction.service";
import { MoneyCorrectionListItem } from "../../../money_correction/types/money_correction.types";

/**
 * GET /employee-debt/:id/corrections — historial de correcciones de una
 * deuda. Mismo alcance de LECTURA que el resto del módulo (la empresa de la
 * sesión; null = Super Administrador): primero se confirma que la deuda es
 * de esa empresa (404 si no) y recién ahí se lee el historial.
 */
const getEmployeeDebtCorrections = async ({
  debtId,
  companyId,
  page,
  limit,
}: {
  debtId: number;
  companyId: number | null;
  page: number;
  limit: number;
}): Promise<PaginatedResult<MoneyCorrectionListItem>> => {
  const debt = await DataBase.instance.employee_debt.findOne({ where: { id: debtId }, attributes: ["id", "company_id"] });
  if (!debt || (companyId !== null && Number(debt.company_id) !== companyId)) throw new AppError(404, "La deuda no existe");

  return listMoneyCorrections({ sourceType: "employee_debt", sourceId: debtId, page, limit });
};

export { getEmployeeDebtCorrections };
