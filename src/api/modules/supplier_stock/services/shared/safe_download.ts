import { lookup as dnsLookup } from "dns/promises";
import https from "https";
import net from "net";
import { AppError } from "../../../../../core/errors/AppError";

// Descarga segura del Excel de un proveedor (plan §7, SSRF): solo https, se
// resuelve el DNS y se rechazan IP privadas o locales (también en cada
// redirección, y la conexión usa la IP ya validada: sin "DNS rebinding"),
// con tope de tamaño y de tiempo.
const MAX_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

const notAllowed = (message: string) => new AppError(400, message, undefined, "STOCK_URL_NOT_ALLOWED");
const downloadFailed = (message: string) => new AppError(422, message, undefined, "STOCK_DOWNLOAD_FAILED");

const IPV4_BLOCKED: ReadonlyArray<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const ipv4ToNumber = (ip: string) => ip.split(".").reduce((total, part) => total * 256 + Number(part), 0);

const isBlockedIpv4 = (ip: string) =>
  IPV4_BLOCKED.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : 2 ** 32 - 2 ** (32 - bits);
    return (ipv4ToNumber(ip) & mask) >>> 0 === (ipv4ToNumber(base) & mask) >>> 0;
  });

// IP privada, local, de enlace local o reservada (v4 o v6).
export const isBlockedAddress = (ip: string): boolean => {
  if (net.isIPv4(ip)) return isBlockedIpv4(ip);
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isBlockedIpv4(mapped[1]);
  return lower === "::" || lower === "::1" || /^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff");
};

// Enlaces de compartir de Google Drive/Sheets, Dropbox y OneDrive a su
// descarga directa (las importadoras suelen mandar esos).
export const toDirectDownloadUrl = (raw: string): URL => {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw notAllowed("El enlace no es válido");
  }
  const driveFile = url.hostname === "drive.google.com" ? url.pathname.match(/\/file\/d\/([^/]+)/) : null;
  if (driveFile?.[1]) return new URL(`https://drive.google.com/uc?export=download&id=${driveFile[1]}`);
  const sheet = url.hostname === "docs.google.com" ? url.pathname.match(/\/spreadsheets\/d\/([^/]+)/) : null;
  if (sheet?.[1]) return new URL(`https://docs.google.com/spreadsheets/d/${sheet[1]}/export?format=xlsx`);
  if (url.hostname.endsWith("dropbox.com")) {
    url.searchParams.set("dl", "1");
    return url;
  }
  if (url.hostname === "1drv.ms" || url.hostname.endsWith("onedrive.live.com") || url.hostname.endsWith("sharepoint.com")) {
    url.searchParams.set("download", "1");
    return url;
  }
  return url;
};

// Resuelve el host y devuelve una IP pública (o corta si alguna es privada).
const resolvePublicAddress = async (hostname: string): Promise<{ address: string; family: number }> => {
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw notAllowed("El enlace apunta a una dirección interna: no se permite");
    return { address: hostname, family: net.isIPv4(hostname) ? 4 : 6 };
  }
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dnsLookup(hostname, { all: true });
  } catch {
    throw downloadFailed(`No se encontró el servidor "${hostname}"`);
  }
  if (addresses.length === 0 || addresses.some((entry) => isBlockedAddress(entry.address))) {
    throw notAllowed("El enlace apunta a una dirección interna: no se permite");
  }
  return addresses[0] as { address: string; family: number };
};

interface DownloadResult {
  buffer: Buffer;
  finalUrl: string;
}

const requestOnce = (url: URL, pinned: { address: string; family: number }): Promise<{ status: number; location?: string; buffer?: Buffer }> =>
  new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "GET",
        headers: { "User-Agent": "VanysStockReader/1.0", Accept: "*/*" },
        // Conecta a la IP ya validada (el nombre sigue yendo en SNI y Host).
        // Node 20+ pide la lista completa (`all: true`, por autoSelectFamily).
        lookup: ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
          if (options?.all) return callback(null, [{ address: pinned.address, family: pinned.family }]);
          return callback(null, pinned.address, pinned.family);
        }) as unknown as net.LookupFunction,
        timeout: TIMEOUT_MS,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          resolve({ status, location: response.headers.location });
          return;
        }
        if (status !== 200) {
          response.resume();
          reject(downloadFailed(`El servidor del proveedor respondió ${status}`));
          return;
        }
        const declared = Number(response.headers["content-length"] ?? 0);
        if (declared > MAX_BYTES) {
          response.destroy();
          reject(downloadFailed("El archivo pesa más de 20 MB"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            response.destroy();
            reject(downloadFailed("El archivo pesa más de 20 MB"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => resolve({ status, buffer: Buffer.concat(chunks) }));
        response.on("error", (error) => reject(downloadFailed(`Se cortó la descarga: ${error.message}`)));
      }
    );
    request.on("timeout", () => request.destroy(downloadFailed("El servidor del proveedor tardó demasiado")));
    request.on("error", (error) => reject(error instanceof AppError ? error : downloadFailed(`No se pudo descargar: ${error.message}`)));
    request.end();
  });

// Descarga el archivo siguiendo hasta 5 redirecciones, validando cada una.
export const downloadStockFile = async (rawUrl: string): Promise<DownloadResult> => {
  let url = toDirectDownloadUrl(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (url.protocol !== "https:") throw notAllowed("Solo se aceptan enlaces https");
    const pinned = await resolvePublicAddress(url.hostname);
    const result = await requestOnce(url, pinned);
    if (result.buffer) return { buffer: result.buffer, finalUrl: url.toString() };
    url = new URL(result.location ?? "", url);
  }
  throw downloadFailed("El enlace redirige demasiadas veces");
};
