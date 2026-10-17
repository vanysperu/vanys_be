import { literal, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

const disableOrEnableCompanyById = async ({
  companyId,
  updatedBy,
  transaction,
}: {
  companyId: number;
  updatedBy?: number;
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.company.update(
      {
        is_deleted: literal("CASE WHEN is_deleted = true THEN false ELSE true END"),
        updated_by: updatedBy,
        updated_at: nowUtc(),
      },
      { where: { id: companyId }, transaction }
    );
  } catch (error) {
    throw error;
  }
};

export { disableOrEnableCompanyById };
