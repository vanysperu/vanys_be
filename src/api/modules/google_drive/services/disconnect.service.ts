import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { readDriveConfig } from "./shared/config";
import { forgetAccessToken, loadDriveConnection } from "./shared/company_drive";
import { revokeToken } from "./shared/drive_client";
import { decryptSecret } from "./shared/token_crypto";

// Desconecta el Drive de la empresa: se quita el permiso en Google y se borra
// la conexión. Los archivos que ya están en Drive NO se tocan (pedido
// explícito del usuario: nunca se borra nada en Drive). Las copias que
// queden pendientes esperan a que se conecte otra cuenta.
export async function disconnectDriveService(companyId: number): Promise<{ company_id: number }> {
  const connection = await loadDriveConnection(companyId);
  if (!connection) throw new AppError(404, "La empresa no tiene un Google Drive conectado");

  const config = readDriveConfig();
  if (config) {
    try {
      await revokeToken(decryptSecret(connection.refresh_token_encrypted, config.key));
    } catch (error) {
      // Mejor esfuerzo: si el secreto no se puede leer, igual se desconecta.
      console.error("[google-drive] No se pudo revocar el permiso:", error);
    }
  }
  await DataBase.instance.company_drive_connection.destroy({ where: { id: connection.id } });
  forgetAccessToken(companyId);
  return { company_id: companyId };
}
