import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { requireDriveConfig } from "./shared/config";
import { buildAuthorizeUrl } from "./shared/drive_client";
import { signOAuthState } from "./shared/token_crypto";

// El retorno de Google vale 10 minutos.
const STATE_TTL_MS = 10 * 60 * 1000;

// Dirección de Google donde el Super Administrador inicia sesión con el Gmail
// de la empresa para conectar su Drive.
export async function getDriveConnectUrlService(companyId: number, userId: number): Promise<{ url: string }> {
  const config = requireDriveConfig();
  const company = await DataBase.instance.company.findByPk(companyId, { attributes: ["id"] });
  if (!company) throw new AppError(404, "La empresa no existe");

  const state = signOAuthState({ companyId, userId, exp: Date.now() + STATE_TTL_MS }, config.key);
  return { url: buildAuthorizeUrl(config, state) };
}
