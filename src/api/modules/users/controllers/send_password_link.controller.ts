import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { utcToBusinessParts } from "../../../../utils/dateUtils";
import { DataBase } from "../../../../database";
import { LogAction } from "../../logs/model/log.model";
import { createLogController } from "../../logs/controllers/log.controller";
import { PasswordLinkPurpose } from "../../auth/model/password_reset_token.model";
import { issuePasswordLink } from "../../auth/services/password_link/issue_password_link.service";
import { userBelongsToCaller } from "../services/shared/user_scope.service";

// POST /api/user/:id/password-link { purpose: "invite" | "reset" }
// "Reenviar invitación" o "Enviar enlace para restablecer" desde Usuarios. El
// enlace también vuelve en la respuesta, para copiarlo y mandarlo por WhatsApp
// si el correo no llega (decisión del usuario). Cada enlace nuevo anula los
// anteriores.
export const sendPasswordLinkController = asyncHandler(async (req: Request, res: Response) => {
  const actor = req.user as IToken;
  const targetUserId = Number(req.params.id);
  const purpose = req.body.purpose as PasswordLinkPurpose;

  if (!(await userBelongsToCaller(targetUserId, actor))) {
    throw new AppError(403, "No tienes acceso a este usuario");
  }

  const target = await DataBase.instance.user.findOne({
    where: { id: targetUserId, is_deleted: false },
    attributes: ["id", "email", "status"],
  });
  if (!target) throw new AppError(404, "El usuario no existe");
  if (!target.status) throw new AppError(409, "El usuario está deshabilitado: habilítalo antes de enviarle un enlace", undefined, "USER_DISABLED");

  const link = await DataBase.instance.sequelize.transaction((transaction) =>
    issuePasswordLink({ userId: targetUserId, purpose, requestedIp: req.ip ?? null, actorId: actor.userId, transaction })
  );

  await createLogController({
    user_id: actor.userId,
    action: LogAction.UPDATE,
    module: "user",
    description:
      purpose === "invite"
        ? `Se reenvió la invitación al usuario con ID ${targetUserId}`
        : `Se envió un enlace para restablecer la contraseña del usuario con ID ${targetUserId}`,
    ip_address: req.ip ?? "unknown",
    user_agent: req.headers["user-agent"] || "unknown",
    company_id: actor.companyId,
  });

  ok(
    res,
    200,
    { url: link.url, expiresAt: utcToBusinessParts(link.expiresAt), emailConfigured: link.emailConfigured },
    link.emailConfigured
      ? `Enlace enviado a ${target.email}.`
      : "El correo no está configurado: copia el enlace y envíaselo."
  );
});
