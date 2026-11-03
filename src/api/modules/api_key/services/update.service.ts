import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { nowUtc } from "../../../../utils/dateUtils";
import { ApiKeyDto, UpdateApiKeyDto } from "../types/api_key.types";
import { getApiKeyDtoById } from "./shared/api_key_mapper";
import { assertBusinessUnitOfCompany } from "./shared/business_unit";

// Solo se editan el nombre y la tienda. La key en sí y su empresa no cambian
// (otra empresa = otra key). Una key revocada ya no se edita.
export async function updateApiKeyService(id: number, dto: UpdateApiKeyDto, actorId: number): Promise<ApiKeyDto> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const apiKey = await DataBase.instance.api_key.findOne({ where: { id }, transaction, lock: transaction.LOCK.UPDATE });
    if (!apiKey) throw new AppError(404, "La API key no existe");
    if (apiKey.is_deleted) throw new AppError(409, "La API key está revocada: ya no se puede editar", undefined, "API_KEY_REVOKED");

    if (dto.business_unit_id !== undefined) {
      await assertBusinessUnitOfCompany(dto.business_unit_id, apiKey.company_id, transaction);
    }

    await DataBase.instance.api_key.update(
      {
        name: dto.name === undefined ? apiKey.name : dto.name.trim(),
        business_unit_id: dto.business_unit_id === undefined ? apiKey.business_unit_id : dto.business_unit_id,
        updated_by: actorId,
        updated_at: nowUtc(),
      },
      { where: { id }, transaction }
    );

    const updated = await getApiKeyDtoById(id, transaction);
    if (!updated) throw new AppError(404, "La API key no existe");
    return updated;
  });
}
