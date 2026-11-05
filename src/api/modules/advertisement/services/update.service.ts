import { DataBase } from "../../../../database";
import { nowUtc } from "../../../../utils/dateUtils";
import { purgeUnusedCompanyAssets } from "../../uploads/services/delete/company_asset.service";
import { AdvertisementActor, AdvertisementDto, UpdateAdvertisementInput } from "../types/advertisement.types";
import { loadAdvertisementDto } from "./shared/advertisement_mapper";
import { lockAdvertisementForWrite } from "./shared/advertisement_scope";
import { assertAdvertisementImageUsable } from "./shared/images";
import { compactOrder, moveToPosition, nextPosition } from "./shared/positions";
import { assertAdvertisementZoneUsable } from "./shared/zones";

/**
 * Cambia zona, título, enlace, imagen y/o posición. Nunca cambia la empresa.
 * - Otra zona: el anuncio pasa al final de la nueva y la anterior cierra su
 *   hueco; si además llega `position`, se ubica ahí dentro de la nueva.
 * - Otra imagen: la anterior se BORRA en la misma transacción (pedido
 *   explícito del usuario: no se conserva ninguna foto que se quita).
 */
export async function updateAdvertisementService(
  id: number,
  input: UpdateAdvertisementInput,
  actor: AdvertisementActor
): Promise<AdvertisementDto> {
  await DataBase.instance.sequelize.transaction(async (transaction) => {
    const current = await lockAdvertisementForWrite(id, actor, transaction);
    const companyId = Number(current.company_id);
    const previousZoneId = current.zone_id === null ? null : Number(current.zone_id);
    const zoneId = input.zone_id === undefined ? previousZoneId : input.zone_id;
    const changesZone = zoneId !== previousZoneId;
    const replacesImage = input.image_path !== undefined && input.image_path !== current.image_path;

    if (changesZone) await assertAdvertisementZoneUsable(zoneId, companyId, transaction);
    if (replacesImage && input.image_path) await assertAdvertisementImageUsable(input.image_path, companyId, transaction);

    await DataBase.instance.advertisement.update(
      {
        zone_id: zoneId,
        position: changesZone ? await nextPosition(companyId, zoneId, transaction) : current.position,
        title: input.title === undefined ? current.title : input.title.trim(),
        link_url: input.link_url === undefined ? current.link_url : input.link_url?.trim() || null,
        image_path: replacesImage && input.image_path ? input.image_path : current.image_path,
        updated_by: actor.userId,
        updated_at: nowUtc(),
      },
      { where: { id }, transaction }
    );

    if (changesZone) await compactOrder({ companyId, zoneId: previousZoneId }, actor.userId, transaction);
    if (input.position !== undefined) {
      await moveToPosition({ companyId, zoneId }, id, input.position, actor.userId, transaction);
    }
    if (replacesImage) {
      await purgeUnusedCompanyAssets({ companyId, replacedPaths: [current.image_path], transaction });
    }
  });

  return loadAdvertisementDto(id);
}
