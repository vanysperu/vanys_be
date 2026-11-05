import { DataBase } from "../../../../database";
import { AdvertisementActor, AdvertisementDto } from "../types/advertisement.types";
import { loadAdvertisementDto } from "./shared/advertisement_mapper";
import { lockAdvertisementForWrite } from "./shared/advertisement_scope";
import { moveToPosition } from "./shared/positions";

// Lleva el anuncio a la posición pedida dentro de SU zona (1 = primero en la
// web) y corre a los demás. Las flechas del panel mandan la posición ± 1.
export async function moveAdvertisementService(
  id: number,
  position: number,
  actor: AdvertisementActor
): Promise<AdvertisementDto> {
  await DataBase.instance.sequelize.transaction(async (transaction) => {
    const current = await lockAdvertisementForWrite(id, actor, transaction);
    const scope = {
      companyId: Number(current.company_id),
      zoneId: current.zone_id === null ? null : Number(current.zone_id),
    };
    await moveToPosition(scope, id, position, actor.userId, transaction);
  });

  return loadAdvertisementDto(id);
}
