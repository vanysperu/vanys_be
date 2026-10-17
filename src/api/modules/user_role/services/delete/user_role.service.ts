import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";

export const destroyUserRole = async ({
  userId,
  roleIds,
  transaction,
}: {
  userId: number;
  roleIds: number[];
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.userRole.destroy({
      where: {
        user_id: userId,
        role_id: {
          [Op.in]: roleIds,
        },
      },
      transaction,
    });
  } catch (error) {
    throw error;
  }
};

export const destroyAllRolesByUser = async ({
  userId,
  transaction,
}: {
  userId: number;
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.userRole.destroy({
      where: {
        user_id: userId,
      },
      transaction,
    });
  } catch (error) {
    throw error;
  }
};
