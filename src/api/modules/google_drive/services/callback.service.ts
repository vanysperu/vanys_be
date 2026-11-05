import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../database";
import { nowUtc } from "../../../../utils/dateUtils";
import { requireDriveConfig } from "./shared/config";
import { forgetAccessToken, rootFolderName } from "./shared/company_drive";
import { createFolder, DriveError, exchangeCode, getAbout } from "./shared/drive_client";
import { encryptSecret, verifyOAuthState } from "./shared/token_crypto";
import { retryPendingDriveCopies } from "../../invoice/services/shared/drive_copy";

export type DriveCallbackResult = { ok: true; companyId: number; email: string } | { ok: false; companyId: number | null; reason: string };

// ¿Sigue siendo Super Administrador quien inició la conexión?
const isActiveSystemUser = async (userId: number): Promise<boolean> => {
  const rows = (await DataBase.instance.sequelize.query(
    `SELECT 1 FROM user_role ur
     INNER JOIN role r ON r.id = ur.role_id AND r.status = true AND r.is_system = true
     INNER JOIN \`user\` u ON u.id = ur.user_id AND u.is_deleted = false AND u.status = true
     WHERE ur.user_id = :userId LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { userId } }
  )) as unknown[];
  return rows.length > 0;
};

/**
 * Vuelta de Google con el permiso del Gmail de la empresa. Llega sin sesión:
 * la empresa y quién conectó salen del `state` firmado. Guarda el permiso
 * cifrado, crea la carpeta "Facturas - <empresa>" y copia lo que estaba
 * pendiente. Nunca lanza: devuelve el motivo para mostrarlo en la pantalla.
 */
export async function handleDriveCallbackService(input: {
  code?: string;
  state?: string;
  error?: string;
}): Promise<DriveCallbackResult> {
  const config = requireDriveConfig();
  const state = verifyOAuthState(input.state, config.key);
  if (!state) return { ok: false, companyId: null, reason: "El enlace para conectar Drive venció o no es válido. Vuelve a intentarlo." };
  if (input.error || !input.code) {
    return { ok: false, companyId: state.companyId, reason: "No se dio el permiso en Google." };
  }
  if (!(await isActiveSystemUser(state.userId))) {
    return { ok: false, companyId: state.companyId, reason: "Solo un Super Administrador puede conectar Drive." };
  }

  try {
    const { accessToken, refreshToken } = await exchangeCode(config, input.code);
    if (!refreshToken) {
      return { ok: false, companyId: state.companyId, reason: "Google no entregó un permiso permanente. Quita el acceso de la app en tu cuenta de Google y vuelve a conectar." };
    }
    const about = await getAbout(accessToken);
    const company = await DataBase.instance.company.findByPk(state.companyId, { attributes: ["business_name"] });
    const rootId = await createFolder(accessToken, rootFolderName(company?.business_name ?? `Empresa ${state.companyId}`), null);
    const now = nowUtc();
    const values = {
      google_email: about.email,
      refresh_token_encrypted: encryptSecret(refreshToken, config.key),
      root_folder_id: rootId,
      last_error: null,
      updated_by: state.userId,
      updated_at: now,
    };

    const existing = await DataBase.instance.company_drive_connection.findOne({ where: { company_id: state.companyId } });
    if (existing) {
      await DataBase.instance.company_drive_connection.update(values, { where: { id: existing.id } });
    } else {
      await DataBase.instance.company_drive_connection.create({
        id: 0,
        company_id: state.companyId,
        ...values,
        created_by: state.userId,
        created_at: now,
      });
    }
    forgetAccessToken(state.companyId);

    // Lo que esperaba la conexión se copia ya, sin esperar al reintento.
    void retryPendingDriveCopies({ companyId: state.companyId }).catch((error: unknown) =>
      console.error("[google-drive] Error al copiar facturas pendientes:", error)
    );
    return { ok: true, companyId: state.companyId, email: about.email };
  } catch (error) {
    const reason = error instanceof DriveError ? error.message : "No se pudo conectar con Google Drive.";
    console.error("[google-drive] Error al conectar:", error);
    return { ok: false, companyId: state.companyId, reason };
  }
}
