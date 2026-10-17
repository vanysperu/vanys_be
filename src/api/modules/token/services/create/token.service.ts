import moment from "moment";
import { v4 as uuidv4 } from "uuid";
import { DataBase } from "../../../../../database";
import { TokenAttributes } from "../../models/token.model";
import { Transaction } from "sequelize";
import { nowUtc } from "../../../../../utils/dateUtils";

export const createToken = async ({
  user_id,
  expires_at,
  transaction,
}: {
  user_id: number;
  expires_at?: Date;
  transaction?: Transaction;
}): Promise<TokenAttributes> => {
  try {
    return await DataBase.instance.token.create(
      {
        user_id: user_id,
        uuid: uuidv4(),
        created_at: nowUtc(),
        last_request_at: nowUtc(),
        status: true,
        id: 0,
        expires_at: expires_at || moment().add(850, "hours").toDate(),
      },
      { transaction }
    );
  } catch (err) {
    throw err;
  }
};
