import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";

// La tienda de una key tiene que ser de SU empresa y estar activa: si no, las
// cotizaciones de la web caerían en una tienda ajena (o en una que ya no
// opera). `null` = sin tienda (a nivel empresa).
export async function assertBusinessUnitOfCompany(
  businessUnitId: number | null | undefined,
  companyId: number,
  transaction?: Transaction
): Promise<void> {
  if (!businessUnitId) return;

  const businessUnit = await DataBase.instance.business_unit.findOne({
    where: { id: businessUnitId, company_id: companyId, is_deleted: false },
    attributes: ["id"],
    transaction,
  });
  if (!businessUnit) throw new AppError(400, "La tienda no existe, está deshabilitada o es de otra empresa");
}
