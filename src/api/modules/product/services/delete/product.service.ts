import { literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

const disableOrEnableProductById = async ({ productId, updatedBy }: { productId: number; updatedBy?: number }) => {
  return DataBase.instance.product.update(
    {
      is_deleted: literal("CASE WHEN is_deleted = true THEN false ELSE true END"),
      updated_by: updatedBy,
      updated_at: nowUtc(),
    },
    { where: { id: productId } }
  );
};

export { disableOrEnableProductById };
