import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

interface SystemUserRow {
  id: number | string;
  company_id: number | string | null;
}

// Super Administradores activos (rol is_system).
export const loadActiveSystemUsers = async (): Promise<{ id: number; companyId: number | null }[]> => {
  const rows = (await DataBase.instance.sequelize.query(
    `SELECT DISTINCT u.id, u.company_id FROM \`user\` u
     INNER JOIN user_role ur ON ur.user_id = u.id
     INNER JOIN role r ON r.id = ur.role_id AND r.status = true AND r.is_system = true
     WHERE u.is_deleted = false AND u.status = true`,
    { type: QueryTypes.SELECT }
  )) as SystemUserRow[];
  return rows.map((row) => ({ id: Number(row.id), companyId: row.company_id === null ? null : Number(row.company_id) }));
};

/**
 * Aviso en la campana para cada Super Administrador activo (recordatorio que
 * vence ya). Lo usan los avisos de plataforma, por ejemplo el cupo diario de
 * correos (pedido explícito del usuario: "si se llega a acabar el límite del
 * envío de correo diario envía una notificación a los super admin").
 */
export async function notifySystemAdmins({ title, message }: { title: string; message: string }): Promise<number> {
  const recipients = await loadActiveSystemUsers();
  if (recipients.length === 0) return 0;

  const now = nowUtc();
  await DataBase.instance.reminder.bulkCreate(
    recipients.map((recipient) => ({
      id: 0,
      company_id: recipient.companyId,
      recipient_user_id: recipient.id,
      title: title.slice(0, 150),
      message: message.slice(0, 500),
      remind_at: now,
      read_at: null,
      is_deleted: false,
      // Aviso automático: lo "crea" el propio destinatario (created_by es obligatorio).
      created_by: recipient.id,
      created_at: now,
      updated_by: recipient.id,
      updated_at: now,
    }))
  );
  return recipients.length;
}
