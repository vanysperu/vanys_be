import { DataBase } from "../../../../database";
import { utcToBusinessParts } from "../../../../utils/dateUtils";
import { readDriveConfig } from "./shared/config";
import { getAccessToken, loadDriveConnection } from "./shared/company_drive";
import { DriveError, getAbout } from "./shared/drive_client";
import { DriveStatusDto } from "../types/google_drive.types";

// Estado del Drive de una empresa para la pantalla de Empresas: con qué Gmail
// está conectado, su espacio y el último error. El espacio se consulta en
// vivo a Google; si falla, se informa el motivo (ej. permiso revocado).
export async function getDriveStatusService(companyId: number): Promise<DriveStatusDto> {
  const company = await DataBase.instance.company.findByPk(companyId, {
    attributes: ["invoice_storage_system", "invoice_storage_drive"],
  });
  const base = {
    configured: readDriveConfig() !== null,
    storage_system: Boolean(company?.invoice_storage_system ?? true),
    storage_drive: Boolean(company?.invoice_storage_drive),
  };

  const connection = await loadDriveConnection(companyId);
  if (!connection) return { ...base, connected: false, email: null, connected_at: null, quota: null, error: null };

  const result = { ...base, connected: true, email: connection.google_email, connected_at: utcToBusinessParts(connection.created_at) };
  if (!base.configured) return { ...result, quota: null, error: "Faltan las variables GOOGLE_DRIVE_* en el servidor" };
  try {
    const about = await getAbout(await getAccessToken(connection));
    return { ...result, quota: { limit_bytes: about.limitBytes, usage_bytes: about.usageBytes }, error: null };
  } catch (error) {
    return { ...result, quota: null, error: error instanceof DriveError ? error.message : "No se pudo consultar Google Drive" };
  }
}
