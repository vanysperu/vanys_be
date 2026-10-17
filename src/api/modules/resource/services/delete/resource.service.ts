import { literal, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

const disableOrEnableResourceById = async ({
  resourceId,
  updatedBy,
  transaction,
}: {
  resourceId: number;
  updatedBy?: number;
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.resource.update(
      {
        active: literal("CASE WHEN active = true THEN false ELSE true END"),
        updated_by: updatedBy,
        updated_at: nowUtc(),
      },
      { where: { id: resourceId }, transaction }
    );
  } catch (error) {
    throw error;
  }
};

export { disableOrEnableResourceById };
