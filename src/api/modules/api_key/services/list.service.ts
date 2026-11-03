import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../core/utils/paginate";
import { ApiKeyDto, ApiKeyListFilter, ApiKeyStatusFilter } from "../types/api_key.types";
import { API_KEY_SELECT, ApiKeyRow, toApiKeyDto } from "./shared/api_key_mapper";

// Condición SQL por estado. Texto fijo de este archivo, nunca del usuario.
const STATUS_CONDITION: Record<ApiKeyStatusFilter, string> = {
  active: "ak.is_deleted = false",
  revoked: "ak.is_deleted = true",
  all: "1 = 1",
};

// Listado de keys de TODAS las empresas (solo lo usa el Super Administrador:
// la ruta exige requireSystemRole), con filtro opcional por empresa.
export async function listApiKeysService(filter: ApiKeyListFilter): Promise<PaginatedResult<ApiKeyDto>> {
  const conditions = [STATUS_CONDITION[filter.status], "(:companyId IS NULL OR ak.company_id = :companyId)"];
  if (filter.name) conditions.push("ak.name LIKE :name");
  const whereClause = conditions.join(" AND ");

  const replacements = {
    companyId: filter.companyId ?? null,
    // Valor bindeado (nunca interpolado): el % va dentro del parámetro.
    name: filter.name ? `%${filter.name}%` : null,
  };

  const [countRow] = (await DataBase.instance.sequelize.query(
    `SELECT COUNT(*) AS total FROM api_key ak WHERE ${whereClause}`,
    { type: QueryTypes.SELECT, replacements }
  )) as { total: number }[];

  const rows = (await DataBase.instance.sequelize.query(
    `${API_KEY_SELECT}
     WHERE ${whereClause}
     ORDER BY ak.created_at DESC, ak.id DESC
     LIMIT :limit OFFSET :offset`,
    {
      type: QueryTypes.SELECT,
      replacements: { ...replacements, limit: filter.limit, offset: (filter.page - 1) * filter.limit },
    }
  )) as ApiKeyRow[];

  return {
    data: rows.map(toApiKeyDto),
    meta: buildPaginationMeta(Number(countRow?.total ?? 0), filter.page, filter.limit),
  };
}
