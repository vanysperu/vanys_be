import { EmailCategory } from "../model/email_outbox.model";

// Un adjunto ya listo para mandar (contenido en base64).
export interface EmailAttachment {
  name: string;
  contentBase64: string;
}

// Lo que recibe un proveedor (Brevo, consola de desarrollo...).
export interface OutgoingEmail {
  // Nombre del remitente para este correo (ej. "Empresa SAC vía Vanys"); sin
  // él, el del proveedor (EMAIL_FROM_NAME). La dirección es siempre la misma.
  fromName?: string;
  to: string;
  cc: string | null;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
  attachments: EmailAttachment[];
}

export interface SentEmail {
  providerMessageId: string | null;
}

// Plantilla renderizada (asunto opcional: si no viene, se usa el guardado).
export interface RenderedEmail {
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  fromName?: string;
}

// Variables de cada plantilla. Se guardan cifradas en la cola.
export interface PasswordLinkPayload {
  recipientName: string;
  link: string;
  // Texto legible del vencimiento ("30 minutos", "72 horas").
  expiresIn: string;
}

export interface PasswordChangedPayload {
  recipientName: string;
  // Fecha y hora de Lima ya formateadas.
  changedAt: string;
}

// Cotización enviada al cliente (Sprint 2, ítem 7). Los importes y fechas ya
// van formateados; el PDF se genera al momento de enviar (versión vigente).
export interface QuotationEmailPayload {
  quotationId: number;
  companyName: string;
  quotationCode: string;
  clientName: string;
  total: string;
  validUntil: string | null;
  // Texto libre de quien lo manda (se escapa al armar el HTML).
  message: string;
  // Enlace a la vista pública; null si está apagado.
  link: string | null;
  attachPdf: boolean;
}

export interface EmailPayloadByTemplate {
  password_reset: PasswordLinkPayload;
  account_invitation: PasswordLinkPayload;
  password_changed: PasswordChangedPayload;
  quotation: QuotationEmailPayload;
}

export type EmailTemplateName = keyof EmailPayloadByTemplate;

export interface EnqueueEmailInput<T extends EmailTemplateName> {
  companyId: number | null;
  category: EmailCategory;
  template: T;
  to: string;
  cc?: string | null;
  replyTo?: string | null;
  subject: string;
  payload: EmailPayloadByTemplate[T];
  related?: { type: string; id: number };
  createdBy: number | null;
}
