import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { UpdateModuleDto } from "../../dtos/module.dto";
import { nowUtc } from "../../../../../utils/dateUtils";

const updateModuleById = async ({
  module,
  moduleId,
  updatedBy,
  transaction,
}: {
  module: UpdateModuleDto;
  moduleId: number;
  updatedBy?: number;
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.module.update(
      { ...module, updated_by: updatedBy, updated_at: nowUtc() },
      { where: { id: moduleId }, transaction }
    );
  } catch (error) {
    throw error;
  }
};

export { updateModuleById };
