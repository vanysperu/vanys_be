import { literal, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

const disableOrEnableBusinessUnitById = async ({
  businessUnitId,
  updatedBy,
  transaction,
}: {
  businessUnitId: number;
  updatedBy?: number;
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.business_unit.update(
      {
        is_deleted: literal("CASE WHEN is_deleted = true THEN false ELSE true END"),
        updated_by: updatedBy,
        updated_at: nowUtc(),
      },
      { where: { id: businessUnitId }, transaction }
    );
  } catch (error) {
    throw error;
  }
};

export { disableOrEnableBusinessUnitById };
