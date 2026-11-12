import { OutgoingEmail, SentEmail } from "../../types/email.types";
import { EmailProvider } from "./email_provider";

// Solo para desarrollo y pruebas: no manda nada, escribe en la consola a quién
// iba el correo. Así se prueba el flujo completo sin cuenta de Brevo. Nunca se
// usa en producción (ver resolve_provider.ts).
export class LogEmailProvider implements EmailProvider {
  readonly name = "log";

  async send(email: OutgoingEmail): Promise<SentEmail> {
    const attachments = email.attachments.map((file) => file.name).join(", ");
    console.log(
      `[email:log] Para: ${email.to}${email.cc ? ` (copia: ${email.cc})` : ""} · Asunto: ${email.subject}` +
        (attachments ? ` · Adjuntos: ${attachments}` : "")
    );
    return { providerMessageId: null };
  }
}
