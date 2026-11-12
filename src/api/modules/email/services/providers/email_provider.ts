import { OutgoingEmail, SentEmail } from "../../types/email.types";

// Un proveedor de correo intercambiable (pedido del plan: cambiar de Brevo a
// otro servicio es solo una variable de entorno).
export interface EmailProvider {
  readonly name: string;
  send(email: OutgoingEmail): Promise<SentEmail>;
}

// Se acabó el cupo del plan (el proveedor lo rechazó): no se reintenta hasta
// que se renueve.
export class EmailQuotaExceededError extends Error {}

// Error que no se arregla reintentando (correo inválido, clave del proveedor
// mal configurada...).
export class EmailPermanentError extends Error {}
