import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";
import { CustomizationTechniquePartialAttributes } from "../../model/customization_technique.model";

const PRICE_FIELDS = ["price_unit", "price_hundred", "price_half_thousand", "price_thousand"] as const;

const updateTechniqueById = async ({
  technique,
  techniqueId,
  updatedBy,
}: {
  technique: CustomizationTechniquePartialAttributes;
  techniqueId: number;
  updatedBy?: number;
}) => {
  const current = await DataBase.instance.customization_technique.findByPk(techniqueId);
  if (!current) throw new AppError(404, "La técnica no existe", undefined, "NOT_FOUND");

  // Precio que queda tras guardar: `undefined` = no se mandó (se conserva el
  // actual); `null` = se vació en el formulario (se borra). Antes el frontend
  // no mandaba los vaciados y el precio viejo se quedaba (pedido del usuario, 21-nov).
  const resultingPrices = PRICE_FIELDS.map((field) => (technique[field] !== undefined ? technique[field] : current[field]));
  const hasAnyPrice = resultingPrices.some((value) => value !== null && value !== undefined);
  if (!hasAnyPrice) {
    throw new AppError(
      400,
      "Debes cargar al menos un precio (por unidad, por ciento, medio millar o por millar)",
      undefined,
      "PRICE_REQUIRED"
    );
  }

  // Whitelist explícita — nunca `{...technique}` directo: mismo hueco que
  // client/product/business_unit, evita mover la técnica a otra empresa
  // mandando `company_id` en el body de `PUT /customization-technique/update/:id`.
  const safePayload = {
    name: technique.name,
    description: technique.description,
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
