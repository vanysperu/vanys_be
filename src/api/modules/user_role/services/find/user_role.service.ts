import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";

export const getRoleIdsByUserId = async (userId: number) => {
  try {
    const query = `
        select r.id from role r
        inner join user_role ur 
            on r.id = ur.role_id
        where ur.user_id = ? and r.status = true
    `;

    const roles = (await DataBase.instance.sequelize.query(query, {
      replacements: [userId],
      type: QueryTypes.SELECT,
    })) as { id: number }[];

    return roles.map((e) => e.id);
  } catch (error) {
    throw error;
  }
};
