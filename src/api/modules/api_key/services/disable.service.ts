import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { nowUtc } from "../../../../utils/dateUtils";
import { ApiKeyDto } from "../types/api_key.types";
import { getApiKeyDtoById } from "./shared/api_key_mapper";

// Revoca una key (soft-delete: la fila queda para la auditoría). Es de UNA
// sola vía a propósito: una key se revoca porque se filtró o ya no se usa, y
// reactivarla volvería a abrir la puerta a quien la tenga. Si hace falta de
// nuevo, se crea otra (la integración cambia su key).
export async function disableApiKeyService(id: number, actorId: number): Promise<ApiKeyDto> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const apiKey = await DataBase.instance.api_key.findOne({ where: { id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!apiKey) throw new AppError(404, "La API key no existe");
    if (apiKey.is_deleted) throw new AppError(409, "La API key ya estaba revocada", undefined, "API_KEY_REVOKED");

    await DataBase.instance.api_key.update(
      { is_deleted: true, updated_by: actorId, updated_at: nowUtc() },
      { where: { id }, transaction }
    );

    const revoked = await getApiKeyDtoById(id, transaction);
    if (!revoked) throw new AppError(404, "La API key no existe");
    return revoked;
  });
}
