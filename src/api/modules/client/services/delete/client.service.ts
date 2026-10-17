import { literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

const disableOrEnableClientById = async ({ clientId, updatedBy }: { clientId: number; updatedBy?: number }) => {
  return DataBase.instance.client.update(
    {
      is_deleted: literal("CASE WHEN is_deleted = true THEN false ELSE true END"),
      updated_by: updatedBy,
      updated_at: nowUtc(),
    },
    { where: { id: clientId } }
  );
};

export { disableOrEnableClientById };
