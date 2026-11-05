import { DataBase } from "../../../../database";
import { purgeUnusedCompanyAssets } from "../../uploads/services/delete/company_asset.service";
import { AdvertisementActor } from "../types/advertisement.types";
import { lockAdvertisementForWrite } from "./shared/advertisement_scope";
import { compactOrder } from "./shared/positions";

/**
 * Elimina el anuncio DE VERDAD (pedido explícito del usuario: "el eliminado es
 * total, no conservamos ninguna foto que se elimine"). Es la excepción a la
 * regla de soft-delete, documentada en el README del módulo. En una sola
 * transacción: se borra la fila, se borra su imagen (si nada más la usa) y se
 * cierra el hueco en el orden de su zona. Si algo falla, no se borra nada.
 */
export async function deleteAdvertisementService(id: number, actor: AdvertisementActor): Promise<{ id: number; title: string }> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const current = await lockAdvertisementForWrite(id, actor, transaction);
    const companyId = Number(current.company_id);

    await DataBase.instance.advertisement.destroy({ where: { id }, transaction });
    await purgeUnusedCompanyAssets({ companyId, replacedPaths: [current.image_path], transaction });
    await compactOrder(
      { companyId, zoneId: current.zone_id === null ? null : Number(current.zone_id) },
      actor.userId,
      transaction
    );

    return { id, title: current.title };
  });
}
