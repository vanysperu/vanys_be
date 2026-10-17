import { literal, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

const disableOrEnableModuleById = async ({
  moduleId,
  updatedBy,
  transaction,
}: {
  moduleId: number;
  updatedBy?: number;
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.module.update(
      {
        active: literal("CASE WHEN active = true THEN false ELSE true END"),
        updated_by: updatedBy,
        updated_at: nowUtc(),
      },
      { where: { id: moduleId }, transaction }
    );
  } catch (error) {
    throw error;
  }
};

export { disableOrEnableModuleById };
