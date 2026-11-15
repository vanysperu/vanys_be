import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../database";
import { PushSendResult, sendPushToUsers } from "./shared/send_push";

interface RecipientRow {
  id: number | string;
}

// Código del botón con el que se completa una cotización pedida desde la web.
const COMPLETE_BUTTON_CODE = "cotizacion.complete.button";

/**
 * Quiénes reciben el aviso de un pedido nuevo: usuarios activos de la empresa
 * cuyo rol puede completar cotizaciones, y de la tienda del pedido (o sin
 * tienda propia, como el administrador de la empresa). Una sola consulta.
 */
export async function findQuoteRequestRecipients(companyId: number, businessUnitId: number | null): Promise<number[]> {
  const rows = (await DataBase.instance.sequelize.query(
    `SELECT DISTINCT u.id
     FROM \`user\` u
     INNER JOIN user_role ur ON ur.user_id = u.id
     INNER JOIN role r ON r.id = ur.role_id AND r.status = true
     INNER JOIN roles_resources rr ON rr.role_id = r.id
     INNER JOIN resources res ON res.id = rr.resource_id AND res.active = true AND res.code = :code
     WHERE u.company_id = :companyId AND u.is_deleted = false AND u.status = true
       AND (:businessUnitId IS NULL OR u.business_unit_id IS NULL OR u.business_unit_id = :businessUnitId)`,
    { type: QueryTypes.SELECT, replacements: { companyId, businessUnitId, code: COMPLETE_BUTTON_CODE } }
  )) as RecipientRow[];
  return rows.map((row) => Number(row.id));
}

/**
 * Aviso al teléfono de un pedido "Pendiente de cotizar" que llegó desde la web
 * (pedido del usuario, 14-nov-2026). Se llama DESPUÉS de confirmar el pedido y
 * nunca lo frena: si el aviso falla, el pedido igual quedó guardado.
 */
export async function notifyQuoteRequestPush({
  quotationId,
  companyId,
  businessUnitId,
  clientName,
  itemsCount,
}: {
  quotationId: number;
  companyId: number;
  businessUnitId: number | null;
  clientName: string;
  itemsCount: number;
}): Promise<PushSendResult> {
  try {
    const recipients = await findQuoteRequestRecipients(companyId, businessUnitId);
    return await sendPushToUsers(recipients, {
      title: "Nuevo pedido para cotizar",
      body: `${clientName} · ${itemsCount} producto(s)`,
      url: `/cotizaciones?abrir=${quotationId}`,
      tag: `quote-${quotationId}`,
    });
  } catch (error: unknown) {
    console.error("[push] No se pudo avisar el pedido", quotationId, error);
    return { attempted: 0, sent: 0, failed: 0 };
  }
}
