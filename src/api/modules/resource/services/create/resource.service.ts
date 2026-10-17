import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { CreateResourceDto } from "../../dtos/resource.dto";
import { nowUtc } from "../../../../../utils/dateUtils";

const createResource = async ({
  resource,
  createdBy,
  transaction,
}: {
  resource: CreateResourceDto;
  createdBy?: number;
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.resource.create(
      {
        id: 0,
        ...resource,
        position: resource.position ?? 0,
        show_in_menu: resource.show_in_menu ?? true,
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

export { createResource };
