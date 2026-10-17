import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { CreateCompanyDto } from "../../dtos/company.dto";
import { nowUtc } from "../../../../../utils/dateUtils";

const createCompany = async ({
  company,
  createdBy,
  transaction,
}: {
  company: CreateCompanyDto;
  createdBy?: number;
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.company.create(
      {
        id: 0,
        ...company,
        is_deleted: false,
        created_by: createdBy,
        created_at: nowUtc(),
      },
      { transaction }
    );
  } catch (error) {
    throw error;
  }
};

export { createCompany };
