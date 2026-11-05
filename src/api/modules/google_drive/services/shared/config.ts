import { createHash } from "crypto";
import { AppError } from "../../../../../core/errors/AppError";

// Credenciales de la "app" Vanys en Google (una sola para todo el sistema,
// ver README). NO son el Drive de ninguna empresa: cada empresa conecta el
// suyo con su Gmail y su permiso se guarda cifrado en company_drive_connection.
export interface DriveConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  // Clave de 32 bytes para cifrar los permisos y firmar el retorno de Google.
  key: Buffer;
}

export function readDriveConfig(): DriveConfig | null {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI?.trim();
  const tokenKey = process.env.GOOGLE_DRIVE_TOKEN_KEY?.trim();
  if (!clientId || !clientSecret || !redirectUri || !tokenKey) return null;
  // SHA-256 de la clave: siempre 32 bytes, sea cual sea su formato.
  return { clientId, clientSecret, redirectUri, key: createHash("sha256").update(tokenKey).digest() };
}

export function requireDriveConfig(): DriveConfig {
  const config = readDriveConfig();
  if (config) return config;
  throw new AppError(
    503,
    "Google Drive no está configurado en el servidor (faltan las variables GOOGLE_DRIVE_*)",
    undefined,
    "DRIVE_NOT_CONFIGURED"
  );
}
