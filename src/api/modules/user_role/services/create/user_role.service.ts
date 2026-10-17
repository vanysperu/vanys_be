import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";

export const setRolesForUser = async ({
  userId,
  roleIds,
  createdBy,
  transaction,
}: {
  userId: number;
  roleIds: number[];
  createdBy?: number;
  transaction?: Transaction;
}) => {
  try {
    const query = `
        insert into user_role (user_id, role_id, created_by, created_at)
        select :userId, r.id, :createdBy, NOW() from role r
        where r.id in (:roleIds) and r.id not in (
            select ur.role_id from user_role ur
            where ur.user_id = :userId
        )
    `;

    return await DataBase.instance.sequelize.query(query, {
      type: QueryTypes.INSERT,
      replacements: {
        userId,
        roleIds,
        createdBy: createdBy ?? null,
      },
      transaction,
    });
  } catch (error) {
    throw error;
  }
};
