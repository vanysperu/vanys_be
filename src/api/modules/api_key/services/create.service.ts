import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { nowUtc } from "../../../../utils/dateUtils";
import { CreateApiKeyDto, CreatedApiKeyDto } from "../types/api_key.types";
import { apiKeyDisplayPrefix, generateApiKey, hashApiKey } from "./shared/api_key_hash";
import { getApiKeyDtoById } from "./shared/api_key_mapper";
import { assertBusinessUnitOfCompany } from "./shared/business_unit";

// Emite una key nueva para una empresa. La key en texto plano se devuelve
// UNA sola vez en esta respuesta: en la base solo queda su SHA-256.
export async function createApiKeyService(dto: CreateApiKeyDto, actorId: number): Promise<CreatedApiKeyDto> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const company = await DataBase.instance.company.findOne({
      where: { id: dto.company_id, is_deleted: false },
      attributes: ["id"],
      transaction,
    });
    if (!company) throw new AppError(400, "La empresa no existe o está deshabilitada");
    await assertBusinessUnitOfCompany(dto.business_unit_id, dto.company_id, transaction);

    const plainKey = generateApiKey();
    const now = nowUtc();
    const created = await DataBase.instance.api_key.create(
      {
        id: 0,
        company_id: dto.company_id,
        business_unit_id: dto.business_unit_id ?? null,
        name: dto.name.trim(),
        key_prefix: apiKeyDisplayPrefix(plainKey),
        key_hash: hashApiKey(plainKey),
        last_used_at: null,
        is_deleted: false,
        created_by: actorId,
        created_at: now,
        updated_by: actorId,
        updated_at: now,
      },
      { transaction }
    );

    const dtoOut = await getApiKeyDtoById(created.id, transaction);
    if (!dtoOut) throw new AppError(500, "No se pudo leer la API key recién creada");
    return { ...dtoOut, plain_key: plainKey };
  });
}
