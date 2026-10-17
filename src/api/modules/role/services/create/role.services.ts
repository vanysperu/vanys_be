import { Transaction } from "sequelize";
import { RoleAttributes } from "../../model/role.model";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

const createRole = async ({
  role,
  createdBy,
  companyId,
  transaction,
}: {
  role: RoleAttributes;
  createdBy?: number;
  companyId?: number | null;
  transaction?: Transaction;
}) => {
  try {
    const newRole: RoleAttributes = {
      ...role,
      status: true,
      company_id: companyId ?? null,
      created_by: createdBy,
      created_at: nowUtc(),
    };

    return await DataBase.instance.role.create(newRole, { transaction });
  } catch (error) {
    throw error;
  }
};

export { createRole };
