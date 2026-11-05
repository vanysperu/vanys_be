import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

interface PositionRow {
  id: number;
  position: number;
}

// Cada zona de cada empresa tiene su propio orden 1..N (los anuncios sin zona
// forman su propio grupo). `zone_id <=> :zoneId` compara también NULL = NULL.
const ORDER_SCOPE = "company_id = :companyId AND zone_id <=> :zoneId";

/**
 * Crear, mover y eliminar cambian el orden de varios anuncios a la vez, así
 * que van de a uno por empresa: se bloquea su fila de `company` hasta el final
 * de la transacción. Sin esto, dos altas a la vez tomaban la misma posición.
 */
export async function lockCompanyOrder(companyId: number, transaction: Transaction): Promise<void> {
  await DataBase.instance.company.findOne({
    where: { id: companyId },
    attributes: ["id"],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
}

// Siguiente posición libre de la zona (al final). Con la empresa bloqueada.
export async function nextPosition(companyId: number, zoneId: number | null, transaction: Transaction): Promise<number> {
  const [row] = (await DataBase.instance.sequelize.query(
    `SELECT COALESCE(MAX(position), 0) AS last_position FROM advertisement WHERE ${ORDER_SCOPE}`,
    { type: QueryTypes.SELECT, replacements: { companyId, zoneId }, transaction }
  )) as { last_position: number | string }[];
  return Number(row?.last_position ?? 0) + 1;
}

// Anuncios de la zona en su orden actual.
const loadOrder = async (companyId: number, zoneId: number | null, transaction: Transaction): Promise<PositionRow[]> => {
  const rows = (await DataBase.instance.sequelize.query(
    `SELECT id, position FROM advertisement WHERE ${ORDER_SCOPE} ORDER BY position ASC, id ASC`,
    { type: QueryTypes.SELECT, replacements: { companyId, zoneId }, transaction }
  )) as PositionRow[];
  return rows.map((row) => ({ id: Number(row.id), position: Number(row.position) }));
};

/**
 * Deja la zona con el orden 1..N de `orderedIds`, en UNA sentencia (CASE con
 * valores bindeados). Solo se tocan las filas cuya posición cambia: las demás
 * conservan su fecha de modificación.
 */
const saveOrder = async (current: PositionRow[], orderedIds: number[], actorId: number, transaction: Transaction) => {
  const positionById = new Map(current.map((row) => [row.id, row.position]));
  const changed = orderedIds.flatMap((id, index) => (positionById.get(id) === index + 1 ? [] : [{ id, position: index + 1 }]));
  if (changed.length === 0) return;

  const cases = changed.map(() => "WHEN ? THEN ?").join(" ");
  const placeholders = changed.map(() => "?").join(", ");
  await DataBase.instance.sequelize.query(
    `UPDATE advertisement SET position = CASE id ${cases} END, updated_by = ?, updated_at = ? WHERE id IN (${placeholders})`,
    {
      replacements: [...changed.flatMap((row) => [row.id, row.position]), actorId, nowUtc(), ...changed.map((row) => row.id)],
      transaction,
    }
  );
};

/**
 * Lleva el anuncio `id` a la posición pedida dentro de su zona (1 = primero) y
 * corre a los demás. Una posición mayor a la cantidad lo deja al final. Llamar
 * con la empresa ya bloqueada (lockCompanyOrder / lockAdvertisementForWrite).
 */
export async function moveToPosition(
  { companyId, zoneId }: { companyId: number; zoneId: number | null },
  id: number,
  requested: number,
  actorId: number,
  transaction: Transaction
): Promise<void> {
  const current = await loadOrder(companyId, zoneId, transaction);
  const others = current.filter((row) => row.id !== id).map((row) => row.id);
  const index = Math.min(Math.max(Math.floor(requested), 1), others.length + 1) - 1;
  await saveOrder(current, [...others.slice(0, index), id, ...others.slice(index)], actorId, transaction);
}

// Quita los huecos (1..N) de una zona: después de eliminar un anuncio o de
// pasarlo a otra zona.
export async function compactOrder(
  { companyId, zoneId }: { companyId: number; zoneId: number | null },
  actorId: number,
  transaction: Transaction
): Promise<void> {
  const current = await loadOrder(companyId, zoneId, transaction);
  await saveOrder(current, current.map((row) => row.id), actorId, transaction);
}
