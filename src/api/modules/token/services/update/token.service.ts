import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

export const closeAllSessions = async ({
  user_id,
  transaction,
}: {
  user_id: number;
  transaction?: Transaction;
}) => {
  return await DataBase.instance.token.update(
    {
      status: false,
    },
    {
      where: {
        user_id,
        status: true
      },
      transaction,
    }
  );
};

export const updateLastRequest = async ({
  uuid,
  transaction,
}: {
  uuid: string;
  transaction?: Transaction;
}) => {
  return await DataBase.instance.token.update(
    {
      last_request_at: nowUtc(),
    },
    {
      where: {
        uuid,
        status: true
      },
      transaction,
    }
  );
};
