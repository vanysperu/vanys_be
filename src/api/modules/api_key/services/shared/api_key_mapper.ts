import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { utcToBusinessParts } from "../../../../../utils/dateUtils";
import { ApiKeyDto } from "../../types/api_key.types";

// Fila cruda: key + empresa, tienda y usuario que la emitió. Nunca se
// selecciona `key_hash`: no sale del backend.
export interface ApiKeyRow {
  id: number;
  name: string;
  key_prefix: string;
  company_id: number;
  company_name: string;
  business_unit_id: number | null;
  business_unit_code: string | null;
  is_deleted: number | boolean;
  last_used_at: Date | null;
  created_at: Date;
  created_by: number | null;
  creator_name: string | null;
  creator_lastname: string | null;
  updated_at: Date | null;
}

export const API_KEY_SELECT = `
  SELECT ak.id, ak.name, ak.key_prefix, ak.company_id, c.business_name AS company_name,
         ak.business_unit_id, bu.business_code AS business_unit_code, ak.is_deleted,
         ak.last_used_at, ak.created_at, ak.created_by, u.name AS creator_name,
         u.paternal_lastname AS creator_lastname, ak.updated_at
  FROM api_key ak
  INNER JOIN company c ON c.id = ak.company_id
  LEFT JOIN business_unit bu ON bu.id = ak.business_unit_id
  LEFT JOIN \`user\` u ON u.id = ak.created_by`;

const toLocal = (value: Date | null) => (value ? utcToBusinessParts(value) : null);

// Fechas guardadas en UTC -> fecha y hora de Lima separadas, recién al salir.
// Una key revocada ya no se edita, así que su `updated_at` es el momento en
// que se revocó.
export const toApiKeyDto = (row: ApiKeyRow): ApiKeyDto => {
  const isRevoked = Boolean(row.is_deleted);
  return {
    id: Number(row.id),
    name: row.name,
    key_prefix: row.key_prefix,
    company: { id: Number(row.company_id), name: row.company_name },
    business_unit:
      row.business_unit_id === null
        ? null
        : { id: Number(row.business_unit_id), code: row.business_unit_code ?? `#${row.business_unit_id}` },
    is_revoked: isRevoked,
    last_used_at: toLocal(row.last_used_at),
    created_at: utcToBusinessParts(row.created_at),
    created_by:
      row.created_by === null
        ? null
        : {
            id: Number(row.created_by),
            name: [row.creator_name, row.creator_lastname].filter(Boolean).join(" ") || `Usuario #${row.created_by}`,
          },
    revoked_at: isRevoked ? toLocal(row.updated_at) : null,
  };
};

export async function getApiKeyDtoById(id: number, transaction?: Transaction): Promise<ApiKeyDto | null> {
  const [row] = (await DataBase.instance.sequelize.query(`${API_KEY_SELECT} WHERE ak.id = :id`, {
    type: QueryTypes.SELECT,
    replacements: { id },
    transaction,
  })) as ApiKeyRow[];
  return row ? toApiKeyDto(row) : null;
}
