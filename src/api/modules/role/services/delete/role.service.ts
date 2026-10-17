import { Transaction, literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

const disableOrEnabledRolById = async ({
  rolId,
  updatedBy,
  companyId,
  transaction,
}: {
  rolId: number;
  updatedBy?: number;
  companyId?: number | null;
  transaction?: Transaction;
}) => {
  try {
    const companyWhere = companyId === null || companyId === undefined ? {} : { company_id: companyId };

    return await DataBase.instance.role.update(
      {
        status: literal("CASE WHEN status = true THEN false ELSE true END"),
        updated_at: nowUtc(),
        updated_by: updatedBy,
      },
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

export {
  disableOrEnabledRolById
}
