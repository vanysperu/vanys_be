import { EmailCategory } from "../model/email_outbox.model";

// Un adjunto ya listo para mandar (contenido en base64).
export interface EmailAttachment {
  name: string;
  contentBase64: string;
}

// Lo que recibe un proveedor (Brevo, consola de desarrollo...).
export interface OutgoingEmail {
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

export interface EmailPayloadByTemplate {
  password_reset: PasswordLinkPayload;
  account_invitation: PasswordLinkPayload;
  password_changed: PasswordChangedPayload;
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
