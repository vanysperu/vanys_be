import { Op, QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";

export interface CompanyRef {
  id: number;
  name: string;
}

// Empresas extra válidas para una key: existen, están activas y no son la
// propia (esa ya está implícita). Devuelve la lista sin repetidos.
export async function assertReplicateCompanies(
  companyIds: number[],
  ownCompanyId: number,
  transaction?: Transaction
): Promise<number[]> {
  const unique = [...new Set(companyIds.map(Number))].filter((id) => id !== ownCompanyId);
  if (unique.length === 0) return [];

  const found = await DataBase.instance.company.findAll({
    where: { id: { [Op.in]: unique }, is_deleted: false },
    attributes: ["id"],
    transaction,
  });
  const foundIds = new Set(found.map((row) => Number(row.id)));
  const missing = unique.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new AppError(400, `Empresas inexistentes o deshabilitadas: ${missing.join(", ")}`, undefined, "INVALID_REPLICATE_COMPANY");
  }
  return unique;
}

// Reemplaza la lista completa de empresas extra de la key (en la transacción
// del llamador).
export async function replaceReplicateCompanies({
  apiKeyId,
  companyIds,
  actorId,
  transaction,
}: {
  apiKeyId: number;
  companyIds: number[];
  actorId: number;
  transaction: Transaction;
}): Promise<void> {
  await DataBase.instance.api_key_company.destroy({ where: { api_key_id: apiKeyId }, transaction });
  if (companyIds.length === 0) return;

  const now = nowUtc();
  await DataBase.instance.api_key_company.bulkCreate(
    companyIds.map((companyId) => ({
      id: 0,
      api_key_id: apiKeyId,
      company_id: companyId,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    })),
    { transaction }
  );
}

// Empresas extra de varias keys en UNA consulta (listado de la pantalla).
export async function loadReplicateCompanies(apiKeyIds: number[], transaction?: Transaction): Promise<Map<number, CompanyRef[]>> {
  const byKey = new Map<number, CompanyRef[]>();
  if (apiKeyIds.length === 0) return byKey;

  const rows = (await DataBase.instance.sequelize.query(
    `SELECT akc.api_key_id, c.id, c.business_name
     FROM api_key_company akc
     INNER JOIN company c ON c.id = akc.company_id
     WHERE akc.api_key_id IN (:apiKeyIds)
     ORDER BY c.business_name ASC`,
    { type: QueryTypes.SELECT, replacements: { apiKeyIds }, transaction }
  )) as { api_key_id: number; id: number; business_name: string }[];

  for (const row of rows) {
    const keyId = Number(row.api_key_id);
    const list = byKey.get(keyId) ?? [];
    list.push({ id: Number(row.id), name: row.business_name });
    byKey.set(keyId, list);
  }
  return byKey;
}

// Ids de las empresas extra (activas) a las que la key puede replicar.
export async function getAllowedReplicateCompanyIds(apiKeyId: number, transaction?: Transaction): Promise<Set<number>> {
  const rows = (await DataBase.instance.sequelize.query(
    `SELECT akc.company_id
     FROM api_key_company akc
     INNER JOIN company c ON c.id = akc.company_id AND c.is_deleted = false
     WHERE akc.api_key_id = :apiKeyId`,
    { type: QueryTypes.SELECT, replacements: { apiKeyId }, transaction }
  )) as { company_id: number }[];
  return new Set(rows.map((row) => Number(row.company_id)));
}
