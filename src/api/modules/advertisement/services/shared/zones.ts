import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";

// Zonas de anuncios (pedido explícito del usuario: "podemos tener varios
// lugares de publicidad"). Viven en Variables Generales, como las categorías
// de producto: `prefix_id` ("Código") es lo que manda la web para pedir los
// anuncios de esa zona y `name` es lo que se ve en el panel. Pueden ser
// globales (company_id NULL, las crea el Super Administrador) o de una empresa.
export const ADVERTISEMENT_ZONE_CATEGORY = "advertisement_zone";

/**
 * Zona que puede usar un anuncio de `companyId`: tiene que existir, estar
 * activa y ser global o de ESA empresa. null/undefined = sin zona.
 */
export async function assertAdvertisementZoneUsable(
  zoneId: number | null | undefined,
  companyId: number,
  transaction?: Transaction
): Promise<void> {
  if (!zoneId) return;
  const zone = await DataBase.instance.variable_general.findOne({
    where: {
      id: zoneId,
      category: ADVERTISEMENT_ZONE_CATEGORY,
      is_deleted: false,
      [Op.or]: [{ company_id: companyId }, { company_id: null }],
    },
    attributes: ["id"],
    transaction,
  });
  if (zone) return;
  throw new AppError(
    400,
    "La zona no existe, está deshabilitada o no es de esta empresa",
    undefined,
    "INVALID_ADVERTISEMENT_ZONE"
  );
}
