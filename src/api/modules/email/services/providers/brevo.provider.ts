import { OutgoingEmail, SentEmail } from "../../types/email.types";
import { EmailPermanentError, EmailProvider, EmailQuotaExceededError } from "./email_provider";

// Brevo por su API HTTPS (no SMTP): no necesita librería y no depende de que el
// hosting deje salir los puertos SMTP. Plan gratis: 300 correos/día.
// https://developers.brevo.com/reference/send-transac-email
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 20_000;

interface BrevoConfig {
  apiKey: string;
  fromAddress: string;
  fromName: string;
}

interface BrevoSuccess {
  messageId?: string;
}

// El texto del error de Brevo, recortado (nunca incluye la API key).
const readError = async (response: Response): Promise<string> => {
  const body = await response.text().catch(() => "");
  return `Brevo respondió ${response.status}: ${body}`.slice(0, 450);
};

export class BrevoEmailProvider implements EmailProvider {
  readonly name = "brevo";

  constructor(private readonly config: BrevoConfig) {}

  async send(email: OutgoingEmail): Promise<SentEmail> {
    const response = await fetch(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": this.config.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: email.fromName || this.config.fromName, email: this.config.fromAddress },
        to: [{ email: email.to }],
        ...(email.cc ? { cc: [{ email: email.cc }] } : {}),
        ...(email.replyTo ? { replyTo: { email: email.replyTo } } : {}),
        subject: email.subject,
        htmlContent: email.html,
        textContent: email.text,
        ...(email.attachments.length > 0
          ? { attachment: email.attachments.map((file) => ({ name: file.name, content: file.contentBase64 })) }
          : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.ok) {
      const body = (await response.json().catch(() => ({}))) as BrevoSuccess;
      return { providerMessageId: body.messageId ?? null };
    }

    const detail = await readError(response);
    // 402: sin créditos; 429: demasiados envíos. En los dos casos se espera.
    if (response.status === 402 || response.status === 429) throw new EmailQuotaExceededError(detail);
    // 400/401/403: datos o clave inválidos; reintentar no lo arregla.
    if (response.status >= 400 && response.status < 500) throw new EmailPermanentError(detail);
    throw new Error(detail);
  }
}
