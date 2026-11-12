import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { LogAction } from "../../logs/model/log.model";
import { createLogController } from "../../logs/controllers/log.controller";
import { completePasswordLink } from "../services/password_link/complete_password_link.service";

// POST /api/password/link/complete — público. Fija la contraseña elegida con un
// enlace de invitación o de recuperación. No inicia sesión: la persona entra
// después con su correo y la contraseña nueva (OWASP).
export const completePasswordLinkController = asyncHandler(async (req: Request, res: Response) => {
  const result = await completePasswordLink(String(req.body.token), String(req.body.password));

  await createLogController({
    user_id: result.userId,
    action: LogAction.UPDATE,
    module: "user",
    description:
      result.purpose === "invite"
        ? `Usuario con ID ${result.userId} activó su cuenta con el enlace de invitación`
        : `Usuario con ID ${result.userId} recuperó su contraseña con un enlace`,
    ip_address: req.ip ?? "unknown",
    user_agent: req.headers["user-agent"] || "unknown",
    company_id: result.companyId,
  });

  const message =
    result.purpose === "invite"
      ? "Tu contraseña quedó lista. Ya puedes iniciar sesión."
      : "Contraseña actualizada. Inicia sesión con la nueva.";
  ok(res, 200, { purpose: result.purpose }, message);
});
