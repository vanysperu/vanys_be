import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { businessLocalToUtc, nowUtc, todayInBusinessTz } from "../../../../../utils/dateUtils";

// Aviso a la campana de lotes por vencer (plan §8.3): para cada almacén que
// controla vencimiento, los lotes con stock que vencen dentro de sus días de
// aviso. Se avisa una vez por día a quienes configuran almacenes (no a toda
// la empresa). Lo llama /internal/jobs/tick.
export const notifyExpiringLots = async (): Promise<{ notified: number }> => {
  const today = todayInBusinessTz();
  const lots = (await DataBase.instance.sequelize.query(
    `SELECT w.company_id, w.name AS warehouse_name, p.name AS product_name, b.color_key, l.lot_code, l.expiry_date, b.on_hand
     FROM stock_balance b
     INNER JOIN warehouse w ON w.id = b.warehouse_id AND w.track_expiry = TRUE AND w.active = TRUE
     INNER JOIN stock_lot l ON l.id = b.lot_key
     INNER JOIN product p ON p.id = b.product_id
     INNER JOIN company_feature f ON f.company_id = w.company_id AND f.feature_code = 'inventory' AND f.enabled = TRUE
     WHERE b.lot_key <> 0 AND b.on_hand > 0 AND l.expiry_date IS NOT NULL
       AND l.expiry_date <= DATE_ADD(:today, INTERVAL w.expiry_alert_days DAY)
     ORDER BY l.expiry_date ASC
     LIMIT 500`,
    { type: QueryTypes.SELECT, replacements: { today } }
  )) as { company_id: number; warehouse_name: string; product_name: string; color_key: string; lot_code: string; expiry_date: string; on_hand: string }[];
  if (lots.length === 0) return { notified: 0 };

  const title = "Lotes por vencer";
  let notified = 0;
  for (const companyId of [...new Set(lots.map((lot) => Number(lot.company_id)))]) {
    const recipients = (await DataBase.instance.sequelize.query(
      `SELECT DISTINCT u.id FROM \`user\` u
       INNER JOIN user_role ur ON ur.user_id = u.id
       INNER JOIN roles_resources rr ON rr.role_id = ur.role_id
       INNER JOIN resources res ON res.id = rr.resource_id AND res.code = 'inventory.warehouses.update.button' AND res.active = TRUE
       WHERE u.company_id = :companyId AND u.is_deleted = FALSE AND u.status = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM reminder r WHERE r.recipient_user_id = u.id AND r.title = :title AND r.created_at >= :since
         )
       LIMIT 50`,
      { type: QueryTypes.SELECT, replacements: { companyId, title, since: businessLocalToUtc(today, "00:00") } }
    )) as { id: number }[];
    if (recipients.length === 0) continue;

    const companyLots = lots.filter((lot) => Number(lot.company_id) === companyId);
    const expired = companyLots.filter((lot) => lot.expiry_date < today).length;
    const lines = companyLots
      .slice(0, 5)
      .map((lot) => `${lot.product_name}${lot.color_key ? ` ${lot.color_key}` : ""} lote ${lot.lot_code} (${lot.warehouse_name}): vence ${lot.expiry_date}`);
    const message = [
      `${companyLots.length} lote(s) por vencer${expired ? `, ${expired} ya vencido(s)` : ""}.`,
      ...lines,
      companyLots.length > 5 ? "Mira el detalle en Inventario." : "",
    ].filter(Boolean).join(" ");
    const now = nowUtc();
    await DataBase.instance.reminder.bulkCreate(
      recipients.map((recipient) => ({
        id: 0,
        company_id: companyId,
        recipient_user_id: recipient.id,
        title,
        message: message.slice(0, 500),
        remind_at: now,
        read_at: null,
        is_deleted: false,
        created_by: recipient.id,
        created_at: now,
        updated_by: recipient.id,
        updated_at: now,
      }))
    );
    notified += recipients.length;
  }
  return { notified };
};
