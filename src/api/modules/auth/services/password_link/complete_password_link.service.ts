import { DataBase } from "../../../../../database";
import { formatInstantDateTimeEsPe, nowUtc } from "../../../../../utils/dateUtils";
import { AppError } from "../../../../../core/errors/AppError";
import { encrypt, verify } from "../../../../../security/criptoService";
import { LoginStatus } from "../../../users/constants/loginStatus";
import { closeAllSessions } from "../../../token/services/update/token.service";
import { enqueueEmail } from "../../../email/services/outbox/enqueue.service";
import { getUserTenantInfo } from "../../../users/services";
import { PasswordLinkPurpose } from "../../model/password_reset_token.model";
import { displayNameOf, hashLinkToken } from "./password_link.shared";

export interface CompletedPasswordLink {
  userId: number;
  purpose: PasswordLinkPurpose;
  companyId: number | null;
}

const LINK_NOT_USABLE = "El enlace no es válido o ya venció. Pide uno nuevo.";

/**
 * Canjea un enlace: fija la contraseña elegida y deja el enlace usado. Todo en
 * una transacción con el enlace bloqueado, así dos envíos simultáneos del
 * mismo enlace no pueden usarlo dos veces.
 *
 * Además (OWASP Forgot Password): cierra todas las sesiones abiertas,
 * desbloquea la cuenta si estaba bloqueada por intentos fallidos, NO inicia
 * sesión sola y avisa por correo que la contraseña cambió.
 */
export async function completePasswordLink(token: string, password: string): Promise<CompletedPasswordLink> {
  const completed = await DataBase.instance.sequelize.transaction(async (transaction) => {
    const link = await DataBase.instance.password_reset_token.findOne({
      where: { token_hash: hashLinkToken(token) },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const now = nowUtc();
    if (!link || link.used_at || link.expires_at.getTime() <= now.getTime()) {
      throw new AppError(400, LINK_NOT_USABLE, undefined, "PASSWORD_LINK_INVALID");
    }

    const user = await DataBase.instance.user.findOne({
      where: { id: link.user_id, is_deleted: false, status: true },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!user) throw new AppError(400, LINK_NOT_USABLE, undefined, "PASSWORD_LINK_INVALID");

    // Al recuperar, la nueva no puede ser la misma de antes.
    const sameAsBefore = link.purpose === "reset" && user.salt && user.password && (await verify(password, user.salt, user.password));
    if (sameAsBefore) {
      throw new AppError(400, "La nueva contraseña no puede ser igual a la anterior", undefined, "PASSWORD_REUSED");
    }

    const { hash, salt } = await encrypt(password);
    await DataBase.instance.user.update(
      {
        password: hash,
        salt,
        must_change_password: false,
        login_status: LoginStatus.H,
        failed_attempts: 0,
        lockout_minutes: null,
        last_lock_date: null,
        last_unlock_date: now,
        updated_by: link.user_id,
        updated_at: now,
      },
      { where: { id: link.user_id }, transaction }
    );

    // Este y cualquier otro enlace pendiente del usuario quedan usados.
    await DataBase.instance.password_reset_token.update(
      { used_at: now, updated_by: link.user_id, updated_at: now },
      { where: { user_id: link.user_id, used_at: null }, transaction }
    );
    await closeAllSessions({ user_id: link.user_id, transaction });

    const { companyId } = await getUserTenantInfo(link.user_id);
    if (user.email) {
      await enqueueEmail(
        {
          companyId,
          category: "security",
          template: "password_changed",
          to: user.email,
          subject: "Tu contraseña cambió",
          payload: { recipientName: displayNameOf(user), changedAt: formatInstantDateTimeEsPe(now) },
          related: { type: "user", id: link.user_id },
          createdBy: link.user_id,
        },
        transaction
      );
    }

    return { userId: Number(link.user_id), purpose: link.purpose, companyId };
  });

  return completed;
}
