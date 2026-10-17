import { DataBase } from "../../../../../database";
import { TokenAttributes } from "../../models/token.model";
import { FindAttributeOptions, Transaction, WhereOptions } from "sequelize";

export const findOneToken = async ({
  where,
  attributes,
  transaction,
}: {
  where?: WhereOptions<TokenAttributes>;
  attributes?: FindAttributeOptions;
  transaction?: Transaction;
}): Promise<TokenAttributes | null> => {
  try {
    const token = await DataBase.instance.token.findOne({
      where,
      attributes,
      transaction,
    });

    if (!token) {
      return null;
    }

    return token.get({ plain: true });
  } catch (error) {
    throw error;
  }
};
