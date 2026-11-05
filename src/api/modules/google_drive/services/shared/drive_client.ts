import { DriveConfig } from "./config";

// Cliente mínimo de Google Drive con fetch (sin librerías nuevas). Permiso
// "drive.file": el sistema solo ve y crea SUS archivos, nunca el resto del
// Drive de la empresa.
const OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
// Ninguna llamada a Google queda colgada más de esto.
const REQUEST_TIMEOUT_MS = 30_000;

// no_space = Drive lleno; revoked = la empresa quitó el permiso; not_found =
// carpeta o archivo borrado en Drive; other = cualquier otra falla.
export type DriveErrorKind = "no_space" | "revoked" | "not_found" | "other";

export class DriveError extends Error {
  constructor(message: string, public kind: DriveErrorKind) {
    super(message);
  }
}

interface GoogleErrorBody {
  error?: string | { message?: string; errors?: { reason?: string }[] };
  error_description?: string;
}

const request = async (url: string, init: RequestInit): Promise<Response> => {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new DriveError(`No se pudo conectar con Google: ${(error as Error).message}`, "other");
  }
};

// Traduce el error de Google a algo que el equipo entienda.
const toDriveError = async (response: Response): Promise<DriveError> => {
  const body = (await response.json().catch(() => ({}))) as GoogleErrorBody;
  const detail = typeof body.error === "object" ? body.error : undefined;
  const reason = detail?.errors?.[0]?.reason;
  if (reason === "storageQuotaExceeded") return new DriveError("El Google Drive de la empresa no tiene espacio", "no_space");
  if (body.error === "invalid_grant" || response.status === 401) {
    return new DriveError("Se perdió el permiso al Google Drive de la empresa: vuelve a conectarlo", "revoked");
  }
  if (response.status === 404) return new DriveError("No se encontró la carpeta o el archivo en Drive", "not_found");
  const message = detail?.message ?? body.error_description ?? `Error ${response.status} de Google Drive`;
  return new DriveError(message, "other");
};

const json = async <T>(response: Response): Promise<T> => {
  if (!response.ok) throw await toDriveError(response);
  return (await response.json()) as T;
};

const authHeaders = (accessToken: string) => ({ Authorization: `Bearer ${accessToken}` });

// Página de Google donde el Super Administrador inicia sesión con el Gmail de
// la empresa. offline + consent: así Google siempre entrega el refresh token.
export function buildAuthorizeUrl(config: DriveConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

const tokenRequest = (config: DriveConfig, params: Record<string, string>) =>
  request(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...params }).toString(),
  });

export async function exchangeCode(config: DriveConfig, code: string): Promise<{ accessToken: string; refreshToken: string | null }> {
  const body = await json<{ access_token: string; refresh_token?: string }>(
    await tokenRequest(config, { code, redirect_uri: config.redirectUri, grant_type: "authorization_code" })
  );
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? null };
}

export async function refreshAccessToken(config: DriveConfig, refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const body = await json<{ access_token: string; expires_in?: number }>(
    await tokenRequest(config, { refresh_token: refreshToken, grant_type: "refresh_token" })
  );
  return { accessToken: body.access_token, expiresIn: body.expires_in ?? 3600 };
}

// Mejor esfuerzo: si falla, igual se borra la conexión en el sistema.
export async function revokeToken(token: string): Promise<void> {
  await request(`${OAUTH_REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}

export interface DriveAbout {
  email: string;
  // null = espacio ilimitado.
  limitBytes: number | null;
  usageBytes: number;
}

export async function getAbout(accessToken: string): Promise<DriveAbout> {
  const body = await json<{ user?: { emailAddress?: string }; storageQuota?: { limit?: string; usage?: string } }>(
    await request(`${DRIVE_API}/about?fields=user(emailAddress),storageQuota(limit,usage)`, { headers: authHeaders(accessToken) })
  );
  const limit = body.storageQuota?.limit;
  return {
    email: body.user?.emailAddress ?? "",
    limitBytes: limit === undefined ? null : Number(limit),
    usageBytes: Number(body.storageQuota?.usage ?? 0),
  };
}

// Las comillas y barras del nombre se escapan para la búsqueda de Drive.
const quote = (value: string) => `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

export async function findFolder(accessToken: string, name: string, parentId: string): Promise<string | null> {
  const q = `name = ${quote(name)} and mimeType = '${FOLDER_MIME}' and ${quote(parentId)} in parents and trashed = false`;
  const body = await json<{ files?: { id: string }[] }>(
    await request(`${DRIVE_API}/files?${new URLSearchParams({ q, fields: "files(id)", spaces: "drive", pageSize: "1" })}`, {
      headers: authHeaders(accessToken),
    })
  );
  return body.files?.[0]?.id ?? null;
}

export async function createFolder(accessToken: string, name: string, parentId: string | null): Promise<string> {
  const body = await json<{ id: string }>(
    await request(`${DRIVE_API}/files?fields=id`, {
      method: "POST",
      headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
    })
  );
  return body.id;
}

// ¿La carpeta sigue existiendo (y no está en la papelera)?
export async function folderExists(accessToken: string, folderId: string): Promise<boolean> {
  const response = await request(`${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,trashed`, {
    headers: authHeaders(accessToken),
  });
  if (response.status === 404) return false;
  const body = await json<{ trashed?: boolean }>(response);
  return !body.trashed;
}

// Subida "multipart": metadatos + bytes en un solo pedido.
export async function uploadFile(
  accessToken: string,
  file: { name: string; mimeType: string; parentId: string; data: Buffer }
): Promise<string> {
  const boundary = `vanys-${Date.now().toString(36)}`;
  const metadata = JSON.stringify({ name: file.name, parents: [file.parentId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`),
    file.data,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const result = await json<{ id: string }>(
    await request(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: { ...authHeaders(accessToken), "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    })
  );
  return result.id;
}

export async function downloadFile(accessToken: string, fileId: string): Promise<Buffer> {
  const response = await request(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: authHeaders(accessToken) });
  if (!response.ok) throw await toDriveError(response);
  return Buffer.from(await response.arrayBuffer());
}
