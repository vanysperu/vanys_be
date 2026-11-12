import { createHash, randomBytes } from "crypto";
import { resolvePublicAppUrl } from "../../../../../core/utils/publicUrl";
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
