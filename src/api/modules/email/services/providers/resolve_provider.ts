import { isProduction } from "../../../../../config/runtime";
import { BrevoEmailProvider } from "./brevo.provider";
import { EmailProvider } from "./email_provider";
import { LogEmailProvider } from "./log.provider";

// Qué proveedor usar, según EMAIL_PROVIDER:
//   brevo → necesita BREVO_API_KEY y EMAIL_FROM_ADDRESS (EMAIL_FROM_NAME opcional).
//   log   → solo desarrollo: escribe en la consola.
// Sin configurar: "log" en desarrollo y ninguno en producción. Sin proveedor,
// los correos se marcan como no enviados y el administrador copia el enlace
// para mandarlo por WhatsApp (decisión del usuario).
const DEFAULT_FROM_NAME = "Vanys";

export function resolveEmailProvider(): EmailProvider | null {
  const configured = process.env.EMAIL_PROVIDER?.trim().toLowerCase();

  if (configured === "brevo") {
    const apiKey = process.env.BREVO_API_KEY?.trim();
    const fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim();
    if (!apiKey || !fromAddress) return null;
    return new BrevoEmailProvider({
      apiKey,
      fromAddress,
      fromName: process.env.EMAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME,
    });
  }

  if (configured === "log" && !isProduction()) return new LogEmailProvider();
  if (!configured && !isProduction()) return new LogEmailProvider();
  return null;
}

export const isEmailConfigured = (): boolean => resolveEmailProvider() !== null;
