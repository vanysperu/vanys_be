import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { CreateModuleDto } from "../../dtos/module.dto";
import { nowUtc } from "../../../../../utils/dateUtils";

const createModule = async ({
  module,
  createdBy,
  transaction,
}: {
  module: CreateModuleDto;
  createdBy?: number;
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.module.create(
      {
        id: 0,
        ...module,
        position: module.position ?? 0,
        active: true,
        created_by: createdBy,
        created_at: nowUtc(),
      },
      { transaction }
    );
  } catch (error) {
    throw error;
  }
};

export { createModule };
