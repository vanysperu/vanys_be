import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { LogAction } from "../../../logs/model/log.model";
import { createLogController } from "../../../logs/controllers/log.controller";
import { getUserTenantInfo } from "../../../users/services";
import { issuePasswordLink } from "./issue_password_link.service";

// Máximo de enlaces de recuperación por cuenta en una hora: evita que alguien
// llene el correo de una persona pidiendo enlaces (OWASP).
const MAX_REQUESTS_PER_HOUR = 3;

/**
 * "¿Olvidaste tu contraseña?". Corre DESPUÉS de responder (ver controller):
 * la respuesta es siempre la misma y tarda lo mismo exista o no el correo, así
 * nadie puede averiguar qué correos están registrados. Si la cuenta no existe,
 * está deshabilitada o pidió demasiados enlaces, simplemente no hace nada.
 */
export async function requestPasswordReset(email: string, requestedIp: string | null, userAgent: string): Promise<void> {
  const user = await DataBase.instance.user.findOne({
    where: { email: email.trim(), is_deleted: false, status: true },
    attributes: ["id"],
  });
  if (!user) return;

  const userId = Number(user.id);
  const tenant = await getUserTenantInfo(userId);
  if (tenant.companyDisabled) return;

  const recent = await DataBase.instance.password_reset_token.count({
    where: {
      user_id: userId,
      purpose: "reset",
      created_at: { [Op.gte]: new Date(nowUtc().getTime() - 60 * 60_000) },
    },
  });
  if (recent >= MAX_REQUESTS_PER_HOUR) return;

  await DataBase.instance.sequelize.transaction(async (transaction) => {
    await issuePasswordLink({ userId, purpose: "reset", requestedIp, actorId: null, transaction });
  });

  await createLogController({
    user_id: userId,
    action: LogAction.APPLICATION,
    module: "user",
    description: `Usuario con ID ${userId} pidió un enlace para recuperar su contraseña`,
    ip_address: requestedIp ?? "unknown",
    user_agent: userAgent,
    company_id: tenant.companyId,
  });
}
