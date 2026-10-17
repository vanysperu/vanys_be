import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { CustomizationTechniqueAttributes } from "../../model/customization_technique.model";

export type CreateTechniqueDto = Omit<
  CustomizationTechniqueAttributes,
  "id" | "is_deleted" | "created_by" | "created_at" | "updated_by" | "updated_at"
>;

const createTechnique = async ({
  technique,
  createdBy,
}: {
  technique: CreateTechniqueDto;
  createdBy?: number;
}) => {
  return DataBase.instance.customization_technique.create({
    id: 0,
    ...technique,
    is_deleted: false,
    created_by: createdBy ?? null,
    created_at: nowUtc(),
    updated_by: null,
    updated_at: null,
  });
};

export { createTechnique };
