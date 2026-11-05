import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { CompanyDriveConnectionModel } from "../../model/company_drive_connection.model";
import { requireDriveConfig } from "./config";
import {
  createFolder,
  downloadFile,
  DriveError,
  findFolder,
  folderExists,
  refreshAccessToken,
  uploadFile,
} from "./drive_client";
import { decryptSecret } from "./token_crypto";

// Token de acceso por empresa en memoria (dura ~1 h): así no se pide uno
// nuevo a Google por cada archivo.
const accessTokens = new Map<number, { token: string; expiresAt: number }>();

export const rootFolderName = (businessName: string) => `Facturas - ${businessName}`.slice(0, 200);

export async function loadDriveConnection(companyId: number): Promise<CompanyDriveConnectionModel | null> {
  return DataBase.instance.company_drive_connection.findOne({ where: { company_id: companyId } });
}

export function forgetAccessToken(companyId: number): void {
  accessTokens.delete(companyId);
}

const markConnectionError = (connection: CompanyDriveConnectionModel, message: string | null) =>
  DataBase.instance.company_drive_connection.update(
    { last_error: message, updated_at: nowUtc() },
    { where: { id: connection.id } }
  );

export async function getAccessToken(connection: CompanyDriveConnectionModel): Promise<string> {
  const companyId = Number(connection.company_id);
  const cached = accessTokens.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const config = requireDriveConfig();
  try {
    const { accessToken, expiresIn } = await refreshAccessToken(config, decryptSecret(connection.refresh_token_encrypted, config.key));
    // Un minuto de margen antes de que venza.
    accessTokens.set(companyId, { token: accessToken, expiresAt: Date.now() + (expiresIn - 60) * 1000 });
    if (connection.last_error) await markConnectionError(connection, null);
    return accessToken;
  } catch (error) {
    // Permiso revocado: queda a la vista en la configuración de la empresa.
    if (error instanceof DriveError && error.kind === "revoked") await markConnectionError(connection, error.message);
    throw error;
  }
}

// Carpeta raíz "Facturas - <empresa>". Si alguien la borró en Drive, se crea
// otra (el sistema nunca borra nada en Drive, pero la empresa sí puede).
async function ensureRootFolder(connection: CompanyDriveConnectionModel, accessToken: string): Promise<string> {
  if (connection.root_folder_id && (await folderExists(accessToken, connection.root_folder_id))) return connection.root_folder_id;

  const company = await DataBase.instance.company.findByPk(connection.company_id, { attributes: ["business_name"] });
  const rootId = await createFolder(accessToken, rootFolderName(company?.business_name ?? `Empresa ${connection.company_id}`), null);
  await DataBase.instance.company_drive_connection.update(
    { root_folder_id: rootId, updated_at: nowUtc() },
    { where: { id: connection.id } }
  );
  return rootId;
}

// Busca o crea cada carpeta del camino (ej. ["2026", "11 - Noviembre", "Compras"]).
async function ensureFolderPath(accessToken: string, rootId: string, segments: string[]): Promise<string> {
  let parentId = rootId;
  for (const name of segments) {
    parentId = (await findFolder(accessToken, name, parentId)) ?? (await createFolder(accessToken, name, parentId));
  }
  return parentId;
}

/**
 * Sube un archivo al Drive de la empresa, dentro de su carpeta de facturas
 * y del camino indicado. Devuelve el id del archivo en Drive. Lanza
 * DriveError si no hay conexión, si no hay espacio o si Google falla.
 */
export async function uploadToCompanyDrive({
  companyId,
  folderPath,
  name,
  mimeType,
  data,
}: {
  companyId: number;
  folderPath: string[];
  name: string;
  mimeType: string;
  data: Buffer;
}): Promise<string> {
  const connection = await loadDriveConnection(companyId);
  if (!connection) throw new DriveError("La empresa no tiene un Google Drive conectado", "revoked");

  const accessToken = await getAccessToken(connection);
  const rootId = await ensureRootFolder(connection, accessToken);
  const parentId = await ensureFolderPath(accessToken, rootId, folderPath);
  return uploadFile(accessToken, { name, mimeType, parentId, data });
}

export async function downloadFromCompanyDrive(companyId: number, fileId: string): Promise<Buffer> {
  const connection = await loadDriveConnection(companyId);
  if (!connection) throw new DriveError("La empresa no tiene un Google Drive conectado", "revoked");
  return downloadFile(await getAccessToken(connection), fileId);
}
