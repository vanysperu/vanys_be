import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { AppError } from "../../../../../core/errors/AppError";
import { getUserTenantInfo } from "../../../users/services";
import { enqueueEmail } from "../../../email/services/outbox/enqueue.service";
import { isEmailConfigured } from "../../../email/services/providers/resolve_provider";
import { PasswordLinkPurpose } from "../../model/password_reset_token.model";
import {
  buildPasswordLinkUrl,
  displayNameOf,
  generateLinkToken,
  hashLinkToken,
  linkLifetimeLabel,
  linkLifetimeMs,
} from "./password_link.shared";

export interface IssuedPasswordLink {
  // Enlace completo: se manda por correo y el admin puede copiarlo para
  // mandarlo por WhatsApp si el correo no llega (decisión del usuario).
  url: string;
  expiresAt: Date;
  // false = no hay proveedor de correo configurado: el correo no saldrá.
  emailConfigured: boolean;
}

const SUBJECT_BY_PURPOSE: Record<PasswordLinkPurpose, string> = {
  reset: "Recupera tu contraseña",
  invite: "Activa tu cuenta en Vanys",
};

/**
 * Emite un enlace nuevo para crear (invitación) o recuperar la contraseña de un
 * usuario y deja el correo en la cola. Pedir uno nuevo anula los anteriores que
 * no se usaron: solo el último enlace sirve.
 */
export async function issuePasswordLink({
  userId,
  purpose,
  requestedIp,
  actorId,
  companyId: knownCompanyId,
  transaction,
}: {
  userId: number;
  purpose: PasswordLinkPurpose;
  requestedIp: string | null;
  // Quién lo pidió (null = el propio usuario desde "¿Olvidaste tu contraseña?").
  actorId: number | null;
  // Empresa del usuario, si ya se conoce. Al crear un usuario hay que pasarla:
  // dentro de la transacción la consulta de empresa todavía no lo ve.
  companyId?: number | null;
  transaction?: Transaction;
}): Promise<IssuedPasswordLink> {
  const user = await DataBase.instance.user.findOne({
    where: { id: userId },
    attributes: ["id", "email", "name", "paternal_lastname"],
    transaction,
  });
  if (!user?.email) throw new AppError(404, "El usuario no existe o no tiene correo");

  const token = generateLinkToken();
  // Primero el enlace: si falta APP_PUBLIC_URL, falla antes de guardar nada.
  const url = buildPasswordLinkUrl(purpose, token);
  const now = nowUtc();
  const expiresAt = new Date(now.getTime() + linkLifetimeMs(purpose));
  const companyId = knownCompanyId !== undefined ? knownCompanyId : (await getUserTenantInfo(userId)).companyId;

  await DataBase.instance.password_reset_token.update(
    { used_at: now, updated_by: actorId, updated_at: now },
    { where: { user_id: userId, used_at: null }, transaction }
  );
  await DataBase.instance.password_reset_token.create(
    {
      // 0 = autoincremental (mismo patrón que el resto de los create del proyecto).
      id: 0,
      user_id: userId,
      company_id: companyId,
      purpose,
      token_hash: hashLinkToken(token),
      expires_at: expiresAt,
      used_at: null,
      requested_ip: requestedIp?.slice(0, 64) ?? null,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    },
    { transaction }
  );

  await enqueueEmail(
    {
      companyId,
      category: "security",
      template: purpose === "reset" ? "password_reset" : "account_invitation",
      to: user.email,
      subject: SUBJECT_BY_PURPOSE[purpose],
      payload: { recipientName: displayNameOf(user), link: url, expiresIn: linkLifetimeLabel(purpose) },
      related: { type: "user", id: userId },
      createdBy: actorId,
    },
    transaction
  );

  return { url, expiresAt, emailConfigured: isEmailConfigured() };
}
