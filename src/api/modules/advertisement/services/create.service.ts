import { DataBase } from "../../../../database";
import { nowUtc } from "../../../../utils/dateUtils";
import { AdvertisementDto, CreateAdvertisementInput } from "../types/advertisement.types";
import { toAdvertisementDto } from "./shared/advertisement_mapper";
import { assertAdvertisementImageUsable } from "./shared/images";
import { lockCompanyOrder, nextPosition } from "./shared/positions";
import { assertAdvertisementZoneUsable } from "./shared/zones";

// Crea el anuncio al final del orden de su zona. La empresa la decide el
// controller desde la sesión (resolveTargetCompanyId), nunca el body.
export async function createAdvertisementService(input: CreateAdvertisementInput, actorId: number): Promise<AdvertisementDto> {
  const zoneId = input.zone_id ?? null;

  const created = await DataBase.instance.sequelize.transaction(async (transaction) => {
    await assertAdvertisementImageUsable(input.image_path, input.companyId, transaction);
    await assertAdvertisementZoneUsable(zoneId, input.companyId, transaction);
    await lockCompanyOrder(input.companyId, transaction);
    const position = await nextPosition(input.companyId, zoneId, transaction);
    const now = nowUtc();

    // Lista blanca explícita: nunca `...input`.
    return DataBase.instance.advertisement.create(
      {
        id: 0,
        company_id: input.companyId,
        zone_id: zoneId,
        title: input.title.trim(),
        link_url: input.link_url?.trim() || null,
        image_path: input.image_path,
        position,
        is_active: input.is_active ?? true,
        created_by: actorId,
        created_at: now,
        updated_by: actorId,
        updated_at: now,
      },
      { transaction }
    );
  });

  return toAdvertisementDto(created);
}
