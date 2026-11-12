import { createHash, randomBytes } from "crypto";
import { isProduction } from "../../../../../config/runtime";
import { AppError } from "../../../../../core/errors/AppError";
import { PasswordLinkPurpose } from "../../model/password_reset_token.model";

// Vigencia de cada tipo de enlace (plan del Sprint 2, sección 5.3 y 5.4).
export const RESET_LINK_MINUTES = 30;
export const INVITE_LINK_HOURS = 72;

export const linkLifetimeMs = (purpose: PasswordLinkPurpose): number =>
  purpose === "reset" ? RESET_LINK_MINUTES * 60_000 : INVITE_LINK_HOURS * 3_600_000;

export const linkLifetimeLabel = (purpose: PasswordLinkPurpose): string =>
  purpose === "reset" ? `${RESET_LINK_MINUTES} minutos` : `${INVITE_LINK_HOURS} horas`;

// 32 bytes de un generador criptográfico: imposible de adivinar.
export const generateLinkToken = (): string => randomBytes(32).toString("base64url");

// En la base solo queda el hash: quien la lea no puede usar un enlace vigente.
export const hashLinkToken = (token: string): string => createHash("sha256").update(token).digest("hex");

// Dirección pública de la app (la del frontend). Se arma con una variable de
// entorno y NUNCA con la cabecera Host de la petición: así nadie puede hacer
// que el correo apunte a otro sitio (OWASP, Host Header Injection).
const DEV_PUBLIC_URL = "http://localhost:4250";

export function resolvePublicAppUrl(): string {
  const configured = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (!isProduction()) return DEV_PUBLIC_URL;
  throw new AppError(
    503,
    "Falta configurar APP_PUBLIC_URL en el servidor: no se pueden armar los enlaces",
    undefined,
    "APP_PUBLIC_URL_MISSING"
  );
}

const PATH_BY_PURPOSE: Record<PasswordLinkPurpose, string> = {
  reset: "/restablecer-contrasena",
  invite: "/activar-cuenta",
};

// El token va después de "#" (fragmento) y no como "?token=": el navegador
// nunca manda el fragmento al servidor, así que no queda en los logs de acceso
// ni sale en la cabecera Referer. La pantalla lo lee y lo envía por POST.
export const buildPasswordLinkUrl = (purpose: PasswordLinkPurpose, token: string): string =>
  `${resolvePublicAppUrl()}${PATH_BY_PURPOSE[purpose]}#token=${encodeURIComponent(token)}`;

// "Juan Pérez" para el saludo del correo.
export const displayNameOf = (user: { name?: string | null; paternal_lastname?: string | null; email?: string | null }) =>
  [user.name, user.paternal_lastname].filter((part): part is string => Boolean(part && part.trim())).join(" ") ||
  user.email ||
  "";
