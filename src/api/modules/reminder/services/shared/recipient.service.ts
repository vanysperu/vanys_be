import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";

// Para VER un recordatorio hay que tener el módulo: solo se puede avisar a
// quien tiene este acceso (si no, el aviso nunca le aparecería). Un rol
// is_system tiene todo otorgado implícitamente.
const REMINDER_ACCESS_CODE = "reminder.due.endpoint";

export interface RecipientRow {
  id: number;
  name: string;
  paternal_lastname: string | null;
  company_id: number | null;
}

// Usuarios activos de la MISMA empresa del que avisa (is_system: de todas)
// que pueden ver recordatorios. `userId` acota a uno puntual (validación).
const findEligibleRecipients = async ({
  actor,
  search,
  userId,
}: {
  actor: IToken;
  search?: string;
  userId?: number;
}): Promise<RecipientRow[]> => {
  const conditions = [
    "u.is_deleted = false",
    "u.status = true",
    "(:companyId IS NULL OR u.company_id = :companyId)",
    `EXISTS (
       SELECT 1 FROM user_role ur
       INNER JOIN role r ON r.id = ur.role_id AND r.status = true
       WHERE ur.user_id = u.id
         AND (r.is_system = true OR EXISTS (
           SELECT 1 FROM roles_resources rr
           INNER JOIN resources res ON res.id = rr.resource_id AND res.active = true
           WHERE rr.role_id = r.id AND res.code = :accessCode
         ))
     )`,
  ];
  if (search) conditions.push("CONCAT(u.name, ' ', COALESCE(u.paternal_lastname, '')) LIKE :search");
  if (userId !== undefined) conditions.push("u.id = :userId");

  return (await DataBase.instance.sequelize.query(
    `SELECT u.id, u.name, u.paternal_lastname, u.company_id
     FROM \`user\` u
     WHERE ${conditions.join(" AND ")}
     ORDER BY u.name ASC, u.paternal_lastname ASC
     LIMIT 200`,
    {
      type: QueryTypes.SELECT,
      replacements: {
        companyId: actor.isSystem ? null : actor.companyId,
        accessCode: REMINDER_ACCESS_CODE,
        // Valor bindeado (nunca interpolado): el % va dentro del parámetro.
        search: search ? `%${search}%` : null,
        userId: userId ?? null,
      },
    }
  )) as RecipientRow[];
};

// Destinatario validado: uno mismo, o un usuario de la propia empresa que
// pueda ver recordatorios. Nunca se confía en un id del body sin validarlo.
const resolveRecipient = async (actor: IToken, recipientUserId: number | null | undefined): Promise<RecipientRow> => {
  const targetId = recipientUserId ?? actor.userId;
  const [recipient] = await findEligibleRecipients({ actor, userId: targetId });
  if (!recipient) {
    throw new AppError(
      400,
      "No puedes enviarle un recordatorio a ese usuario (no existe, está inactivo, es de otra empresa o no tiene acceso a Recordatorios)"
    );
  }
  return recipient;
};

export { findEligibleRecipients, resolveRecipient };
