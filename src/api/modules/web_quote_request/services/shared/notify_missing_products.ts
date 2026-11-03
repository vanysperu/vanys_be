import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { findCompanyRecipients } from "../../../reminder/services/shared/recipient.service";
import { WebQuoteMissingItem } from "../../types/web_quote_request.types";

// Largo de la columna `reminder.message` (500).
const MESSAGE_MAX_LENGTH = 500;
// SKU listados uno por línea; el resto se resume (la lista completa queda en
// el Historial de la cotización).
const MAX_LISTED_SKUS = 8;

export const formatQuotationCode = (quotationId: number) => `COT-${String(quotationId).padStart(4, "0")}`;

const truncate = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

// Versión en una línea, para el Historial de la cotización.
export const describeMissingItems = (items: WebQuoteMissingItem[]) =>
  items.map((item) => `SKU ${item.sku} × ${item.quantity}`).join(", ");

// El aviso se lee de un vistazo en la campana/toast (pedido explícito del
// usuario: "es un poquito difícil verlo en la notificación"): antes era un
// solo párrafo largo; ahora va por líneas — empresa, cliente y un SKU por
// línea. El frontend respeta los saltos de línea (whitespace-pre-line).
const buildMessage = (companyName: string, clientLabel: string, items: WebQuoteMissingItem[]) => {
  const listed = items.slice(0, MAX_LISTED_SKUS).map((item) => `• ${item.sku} × ${item.quantity} u.`);
  const rest = items.length - listed.length;
  const lines = [
    `Empresa: ${companyName}`,
    `Cliente: ${clientLabel}`,
    "SKU que no existen en el catálogo:",
    ...listed,
    ...(rest > 0 ? [`… y ${rest} más (ver Historial de la cotización)`] : []),
    "Créalos y agrégalos al completar la cotización.",
  ];
  return truncate(lines.join("\n"), MESSAGE_MAX_LENGTH);
};

interface NotificationRecipient {
  id: number;
  company_id: number | null;
}

// Usuarios activos de la empresa con acceso a Recordatorios. Si la empresa no
// tiene ninguno (empresa recién creada, o nadie con ese acceso), el aviso
// antes se descartaba en silencio y nadie se enteraba de los SKU faltantes:
// ahora le llega a quien emitió la API key, que es el responsable de la
// integración. Si ese usuario ya no está activo, no hay a quién avisar (el
// detalle queda igual en el Historial de la cotización).
const resolveRecipients = async (companyId: number, issuedBy: number): Promise<NotificationRecipient[]> => {
  const companyRecipients = await findCompanyRecipients(companyId);
  if (companyRecipients.length > 0) return companyRecipients;

  const issuer = await DataBase.instance.user.findOne({
    where: { id: issuedBy, is_deleted: false, status: true },
    attributes: ["id", "company_id"],
  });
  return issuer ? [{ id: Number(issuer.id), company_id: issuer.company_id ?? null }] : [];
};

// Pedido explícito del usuario: si la web manda un SKU que no existe, se
// crea una notificación general para los miembros de la empresa con qué SKU
// no se agregó, a qué cotización y cuántas unidades pidieron — el equipo
// crea el producto y lo agrega al completar la cotización.
//
// Se reutiliza Recordatorios (campana + toast, ya visible para toda la
// empresa): un recordatorio "para ahora" por cada usuario activo de la
// empresa con acceso al módulo. Su `created_by` es obligatorio y la web no
// es un usuario: queda como autor quien emitió la API key.
export async function notifyMissingProducts({
  companyId,
  quotationId,
  clientLabel,
  missingItems,
  issuedBy,
  transaction,
}: {
  companyId: number;
  quotationId: number;
  clientLabel: string;
  missingItems: WebQuoteMissingItem[];
  issuedBy: number;
  transaction: Transaction;
}): Promise<number> {
  if (missingItems.length === 0) return 0;

  const recipients = await resolveRecipients(companyId, issuedBy);
  if (recipients.length === 0) return 0;

  // El nombre de la empresa va en el mensaje: quien emitió la key (ej. el
  // Super Administrador) puede recibir avisos de varias empresas.
  const company = await DataBase.instance.company.findOne({
    where: { id: companyId },
    attributes: ["business_name"],
    transaction,
  });
  const title = `Pedido web ${formatQuotationCode(quotationId)}: ${missingItems.length} producto(s) no encontrado(s)`;
  const message = buildMessage(company?.business_name ?? `Empresa #${companyId}`, clientLabel, missingItems);
  const now = nowUtc();

  await DataBase.instance.reminder.bulkCreate(
    recipients.map((recipient) => ({
      id: 0,
      // Empresa del destinatario (null si es de plataforma), como en
      // cualquier recordatorio.
      company_id: recipient.company_id,
      recipient_user_id: recipient.id,
      title,
      message,
      // "Para ahora": la campana lo muestra en su próxima consulta.
      remind_at: now,
      read_at: null,
      is_deleted: false,
      created_by: issuedBy,
      created_at: now,
      updated_by: issuedBy,
      updated_at: now,
    })),
    { transaction }
  );

  return recipients.length;
}
