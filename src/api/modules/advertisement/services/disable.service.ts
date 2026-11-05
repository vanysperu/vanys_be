import { DataBase } from "../../../../database";
import { nowUtc } from "../../../../utils/dateUtils";
import { AdvertisementActor, AdvertisementDto } from "../types/advertisement.types";
import { loadAdvertisementDto } from "./shared/advertisement_mapper";
import { lockAdvertisementForWrite } from "./shared/advertisement_scope";

// Apaga o prende el anuncio: apagado no sale en la web, pero se conserva con
// su imagen y su posición. Se manda el estado final (no "invertir"), así un
// doble clic no lo vuelve a prender.
export async function setAdvertisementActiveService(
  id: number,
  isActive: boolean,
  actor: AdvertisementActor
): Promise<AdvertisementDto> {
  await DataBase.instance.sequelize.transaction(async (transaction) => {
    const current = await lockAdvertisementForWrite(id, actor, transaction);
    if (Boolean(current.is_active) === isActive) return;

    await DataBase.instance.advertisement.update(
      { is_active: isActive, updated_by: actor.userId, updated_at: nowUtc() },
      { where: { id }, transaction }
    );
  });

  return loadAdvertisementDto(id);
}
