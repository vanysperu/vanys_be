import { literal } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

const disableOrEnableTechniqueById = async ({
  techniqueId,
  updatedBy,
}: {
  techniqueId: number;
  updatedBy?: number;
}) => {
  return DataBase.instance.customization_technique.update(
    {
      is_deleted: literal("CASE WHEN is_deleted = true THEN false ELSE true END"),
      updated_by: updatedBy,
      updated_at: nowUtc(),
    },
    { where: { id: techniqueId } }
  );
};

export { disableOrEnableTechniqueById };
