import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { CustomizationTechniqueAttributes } from "../../model/customization_technique.model";

export type CreateTechniqueDto = Pick<
  CustomizationTechniqueAttributes,
  "company_id" | "name" | "description" | "price_unit" | "price_hundred" | "price_half_thousand" | "price_thousand"
>;

const createTechnique = async ({
  technique,
  createdBy,
}: {
  technique: CreateTechniqueDto;
  createdBy?: number;
}) => {
  // Lista blanca explícita: antes se hacía `{ id: 0, ...body }`, así que el
  // body podía forzar el `id` del registro (o cualquier otra columna).
  return DataBase.instance.customization_technique.create({
    id: 0,
    company_id: technique.company_id,
    name: technique.name,
    description: technique.description ?? null,
    price_unit: technique.price_unit ?? null,
    price_hundred: technique.price_hundred ?? null,
    price_half_thousand: technique.price_half_thousand ?? null,
    price_thousand: technique.price_thousand ?? null,
    is_deleted: false,
    created_by: createdBy ?? null,
    created_at: nowUtc(),
    updated_by: null,
    updated_at: null,
  });
};

export { createTechnique };
