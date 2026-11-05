import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { ADVERTISEMENT_ZONE_CATEGORY } from "../../../advertisement/services/shared/zones";

/**
 * El Código (prefix_id) de una zona de anuncios es lo que manda la web para
 * pedir los anuncios de ese lugar (?zone=inicio), así que no puede repetirse
 * entre las zonas ACTIVAS que ve una empresa (las suyas y las globales). Se
 * compara sin distinguir mayúsculas (colación de MySQL) ni espacios de los
 * extremos. Una zona global no puede repetir el código de ninguna empresa.
 * `id` = la fila que se edita o rehabilita (no choca consigo misma).
 */
export async function assertUniqueAdvertisementZoneCode({
  id,
  category,
  code,
  companyId,
}: {
  id: number | null;
  category: string | undefined;
  code: string | undefined;
  companyId: number | null;
}): Promise<void> {
  const trimmed = code?.trim();
  if (category !== ADVERTISEMENT_ZONE_CATEGORY || !trimmed) return;

  const duplicate = await DataBase.instance.variable_general.findOne({
    where: {
      [Op.and]: [
        { category: ADVERTISEMENT_ZONE_CATEGORY, prefix_id: trimmed, is_deleted: false },
        companyId === null ? {} : { [Op.or]: [{ company_id: companyId }, { company_id: null }] },
        id === null ? {} : { id: { [Op.ne]: id } },
      ],
    },
    attributes: ["id"],
  });
  if (!duplicate) return;
  throw new AppError(409, `Ya existe una zona de anuncios con el código "${trimmed}"`, undefined, "DUPLICATE_ADVERTISEMENT_ZONE");
}
