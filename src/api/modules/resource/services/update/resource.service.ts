import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { UpdateResourceDto } from "../../dtos/resource.dto";
import { nowUtc } from "../../../../../utils/dateUtils";

const updateResourceById = async ({
  resource,
  resourceId,
  updatedBy,
  transaction,
}: {
  resource: UpdateResourceDto;
  resourceId: number;
  updatedBy?: number;
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.resource.update(
      { ...resource, updated_by: updatedBy, updated_at: nowUtc() },
      { where: { id: resourceId }, transaction }
    );
  } catch (error) {
    throw error;
  }
};

export { updateResourceById };
