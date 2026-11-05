import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { AdvertisementModel } from "../../model/advertisement.model";
import { AdvertisementActor } from "../../types/advertisement.types";
import { lockCompanyOrder } from "./positions";

const notFound = () => new AppError(404, "El anuncio no existe", undefined, "ADVERTISEMENT_NOT_FOUND");

/**
 * Anuncio que se va a modificar, bloqueado dentro de `transaction`. Un anuncio
 * de otra empresa responde igual que uno que no existe (404): no se revela qué
 * tiene otra empresa. El Super Administrador puede tocar cualquiera.
 *
 * Bloquea SIEMPRE en el mismo orden: primero la empresa (el orden de sus
 * anuncios, ver lockCompanyOrder) y después el anuncio, igual que crear,
 * mover y eliminar. Así dos cambios simultáneos nunca se bloquean en cruz.
 */
export async function lockAdvertisementForWrite(
  id: number,
  actor: AdvertisementActor,
  transaction: Transaction
): Promise<AdvertisementModel> {
  const found = await DataBase.instance.advertisement.findOne({
    where: { id },
    attributes: ["id", "company_id"],
    transaction,
  });
  if (!found) throw notFound();
  if (!actor.isSystem && Number(found.company_id) !== actor.companyId) throw notFound();

  await lockCompanyOrder(Number(found.company_id), transaction);
  const locked = await DataBase.instance.advertisement.findOne({
    where: { id },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  // Lo eliminó otra persona mientras tanto.
  if (!locked) throw notFound();
  return locked;
}
