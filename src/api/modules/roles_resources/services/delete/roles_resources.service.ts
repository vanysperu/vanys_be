import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";

const revokeResourcesFromRole = async ({
  roleId,
  resourceIds,
  transaction,
}: {
  roleId: number;
  resourceIds: number[];
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.rolesResources.destroy({
      where: {
        role_id: roleId,
        resource_id: { [Op.in]: resourceIds },
      },
      transaction,
    });
  } catch (error) {
    throw error;
  }
};

export { revokeResourcesFromRole };
