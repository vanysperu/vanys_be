import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { UpdateCompanyDto } from "../../dtos/company.dto";
import { nowUtc } from "../../../../../utils/dateUtils";

const updateCompanyById = async ({
  company,
  companyId,
  updatedBy,
  transaction,
}: {
  company: UpdateCompanyDto;
  companyId: number;
  updatedBy?: number;
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.company.update(
      { ...company, updated_by: updatedBy, updated_at: nowUtc() },
      { where: { id: companyId }, transaction }
    );
  } catch (error) {
    throw error;
  }
};

export { updateCompanyById };
