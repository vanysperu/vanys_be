import { NextFunction, Request, Response } from "express";
import { QueryTypes } from "sequelize";
import { AppError } from "../errors/AppError";
import { asyncHandler } from "../utils/asyncHandler";
import { DataBase } from "../../database";
import { hashApiKey } from "../../api/modules/api_key/services/shared/api_key_hash";

export const API_KEY_HEADER = "x-api-key";

// No se actualiza `last_used_at` en cada request: con este margen basta para
// saber si la key se sigue usando, sin un UPDATE por cada pedido.
const LAST_USED_REFRESH_MS = 60 * 60 * 1000;

interface ApiKeyRow {
  id: number;
  name: string;
  company_id: number;
  business_unit_id: number | null;
  created_by: number;
  last_used_at: Date | null;
}

const unauthorized = () => new AppError(401, "API key inválida o revocada", undefined, "INVALID_API_KEY");

// Autentica integraciones sin sesión (ej. la web pública), que no pueden usar
// el token de usuario porque vence. La key va SIEMPRE por cabecera
// (X-Api-Key), nunca por query string: la URL completa queda en los logs de
// acceso. Se busca por su SHA-256 (nunca se guarda en texto plano) y solo
// vale si la key, su empresa y su tienda (si tiene) siguen activas.
export const requireApiKey = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const plainKey = req.header(API_KEY_HEADER)?.trim();
  if (!plainKey) return next(unauthorized());

  const [row] = (await DataBase.instance.sequelize.query(
    `SELECT ak.id, ak.name, ak.company_id, ak.business_unit_id, ak.created_by, ak.last_used_at
     FROM api_key ak
     INNER JOIN company c ON c.id = ak.company_id AND c.is_deleted = false
     LEFT JOIN business_unit bu ON bu.id = ak.business_unit_id
     WHERE ak.key_hash = :keyHash
       AND ak.is_deleted = false
       AND (ak.business_unit_id IS NULL OR bu.is_deleted = false)
     LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { keyHash: hashApiKey(plainKey) } }
  )) as ApiKeyRow[];
  if (!row) return next(unauthorized());

  req.apiKey = {
    id: Number(row.id),
    name: row.name,
    companyId: Number(row.company_id),
    businessUnitId: row.business_unit_id === null ? null : Number(row.business_unit_id),
    issuedBy: Number(row.created_by),
  };

  const lastUsedAt = row.last_used_at ? new Date(row.last_used_at).getTime() : 0;
  if (Date.now() - lastUsedAt > LAST_USED_REFRESH_MS) {
    await DataBase.instance.api_key.update({ last_used_at: new Date() }, { where: { id: row.id } });
  }

  return next();
});
