import { Transaction } from "sequelize";
import { RolePartialAttributes } from "../../model/role.model";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

const updateRoleById = async ({
  role,
  rolId,
  updatedBy,
  companyId,
  transaction,
}: {
  role: RolePartialAttributes;
  rolId: number;
  updatedBy?: number;
  companyId?: number | null;
  transaction?: Transaction;
}) => {
  try {
    const { name, description } = role;

    const companyWhere = companyId === null || companyId === undefined ? {} : { company_id: companyId };

    return await DataBase.instance.role.update(
      { name, description, updated_by: updatedBy, updated_at: nowUtc() },
      {
        where: {
          id: rolId,
          is_system: 0,
          ...companyWhere,
        },
        transaction,
      }
    );
  } catch (error) {
    throw error;
  }
};

export { updateRoleById };
