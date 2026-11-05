import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";

// El permiso de Drive de cada empresa (refresh token) es una credencial: se
// guarda cifrado con AES-256-GCM. Formato: v1:<iv>:<tag>:<datos> en base64.
export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(stored: string, key: Buffer): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Formato de secreto cifrado desconocido");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export interface OAuthState {
  companyId: number;
  userId: number;
  // Vencimiento (ms epoch): el retorno de Google solo vale unos minutos.
  exp: number;
}

const sign = (payload: string, key: Buffer) => createHmac("sha256", key).update(payload).digest("base64url");

// `state` firmado: la vuelta de Google llega sin sesión, así que de acá salen
// la empresa y quién conectó, sin que nadie pueda inventarlos.
export function signOAuthState(state: OAuthState, key: Buffer): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${sign(payload, key)}`;
}

export function verifyOAuthState(token: string | undefined, key: Buffer): OAuthState | null {
  const [payload, signature] = (token ?? "").split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, key));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (!Number.isInteger(state.companyId) || !Number.isInteger(state.userId) || state.exp < Date.now()) return null;
    return state;
  } catch {
    return null;
  }
}
