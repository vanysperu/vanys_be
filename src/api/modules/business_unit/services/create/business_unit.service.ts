import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { CreateBusinessUnitDto } from "../../dtos/business_unit.dto";
import { nowUtc } from "../../../../../utils/dateUtils";

const createBusinessUnit = async ({
  businessUnit,
  createdBy,
  transaction,
}: {
  businessUnit: CreateBusinessUnitDto;
  createdBy?: number;
  transaction?: Transaction;
}) => {
  try {
    return await DataBase.instance.business_unit.create(
      {
        id: 0,
        logo_url: "",
        primary_color: "#000000",
        secondary_color: "#000000",
        ...businessUnit,
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

export { createBusinessUnit };
