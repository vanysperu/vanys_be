import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { nowUtc } from "../../../../utils/dateUtils";
import { ApiKeyDto, UpdateApiKeyDto } from "../types/api_key.types";
import { getApiKeyDtoById } from "./shared/api_key_mapper";
import { assertBusinessUnitOfCompany } from "./shared/business_unit";
import { assertReplicateCompanies, replaceReplicateCompanies } from "./shared/replicate_companies";

// Se editan el nombre, la tienda y las empresas extra para replicar
// productos. La key en sí y su empresa no cambian (otra empresa = otra key).
// Una key revocada ya no se edita.
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

    if (dto.replicate_company_ids !== undefined) {
      const replicateIds = await assertReplicateCompanies(dto.replicate_company_ids, Number(apiKey.company_id), transaction);
      await replaceReplicateCompanies({ apiKeyId: id, companyIds: replicateIds, actorId, transaction });
    }

    const updated = await getApiKeyDtoById(id, transaction);
    if (!updated) throw new AppError(404, "La API key no existe");
    return updated;
  });
}
