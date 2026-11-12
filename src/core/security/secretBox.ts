import { createHash } from "crypto";
import { decryptSecret, encryptSecret } from "../../api/modules/google_drive/services/shared/token_crypto";

// Cifrado de datos sensibles guardados en la base (contenido de la cola de
// correos con enlaces de contraseña, y en fases siguientes credenciales SOL y
// enlaces de proveedores). Mismo AES-256-GCM que el token de Google Drive.
//
// Clave: APP_ENCRYPTION_KEY si existe; si no, se deriva de SECRET_HIDDEN_KEY con
// un prefijo propio (separación de dominio: nunca es la misma clave que firma
// los JWT). Si la clave cambia, lo cifrado antes ya no se puede leer: por eso
// en producción se conserva la que ya está en Hostinger (igual que
// GOOGLE_DRIVE_TOKEN_KEY).
const DERIVATION_PREFIX = "vanys:app-secrets:v1:";

const resolveKey = (): Buffer => {
  const explicit = process.env.APP_ENCRYPTION_KEY?.trim();
  const fallback = process.env.SECRET_HIDDEN_KEY?.trim();
  const material = explicit || (fallback ? `${DERIVATION_PREFIX}${fallback}` : "");
  if (!material) throw new Error("Falta APP_ENCRYPTION_KEY o SECRET_HIDDEN_KEY para cifrar datos sensibles");
  return createHash("sha256").update(material).digest();
};

export const sealSecret = (plain: string): string => encryptSecret(plain, resolveKey());

export const openSecret = (sealed: string): string => decryptSecret(sealed, resolveKey());
