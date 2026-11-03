import { createHash, randomBytes } from "crypto";

// Prefijo fijo para reconocer a simple vista una key de este sistema (en un
// .env, en un log) y no confundirla con otro secreto.
export const API_KEY_PREFIX = "vnk_";

// 32 bytes aleatorios (256 bits) en base64url: no se puede adivinar ni por
// fuerza bruta, por eso alcanza con SHA-256 (rápido) para guardarla — bcrypt
// solo hace falta para secretos de baja entropía como contraseñas, y acá
// costaría ~100 ms en CADA request de la web.
export const generateApiKey = (): string => `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;

export const hashApiKey = (plainKey: string): string => createHash("sha256").update(plainKey).digest("hex");

// Lo único de la key que se guarda legible: alcanza para reconocerla en un
// listado sin servir para autenticarse.
export const apiKeyDisplayPrefix = (plainKey: string): string => plainKey.slice(0, 12);
