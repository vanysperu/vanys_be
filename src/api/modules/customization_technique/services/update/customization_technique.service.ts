import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { CustomizationTechniquePartialAttributes } from "../../model/customization_technique.model";

const updateTechniqueById = async ({
  technique,
  techniqueId,
  updatedBy,
}: {
  technique: CustomizationTechniquePartialAttributes;
  techniqueId: number;
  updatedBy?: number;
}) => {
  // Whitelist explícita — nunca `{...technique}` directo: mismo hueco que
  // client/product/business_unit, evita mover la técnica a otra empresa
  // mandando `company_id` en el body de `PUT /customization-technique/update/:id`.
  const safePayload = {
    name: technique.name,
    description: technique.description,
    extra_type: technique.extra_type,
    extra_value: technique.extra_value,
    price_unit: technique.price_unit,
    price_hundred: technique.price_hundred,
    price_half_thousand: technique.price_half_thousand,
    price_thousand: technique.price_thousand,
  };

  return DataBase.instance.customization_technique.update(
    { ...safePayload, updated_by: updatedBy, updated_at: nowUtc() },
    { where: { id: techniqueId } }
  );
};

export { updateTechniqueById };
