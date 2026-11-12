import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { requestPasswordReset } from "../services/password_link/request_password_reset.service";

// Mismo mensaje exista o no la cuenta (OWASP): no revela qué correos están
// registrados.
const GENERIC_MESSAGE = "Si el correo está registrado, te llegará un enlace para elegir una nueva contraseña.";

// POST /api/password/forgot — público. Responde de inmediato y procesa el pedido
// después: así la respuesta tarda lo mismo exista o no el correo.
export const forgotPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const email = String(req.body.email);
  const ip = req.ip ?? null;
  const userAgent = req.headers["user-agent"] || "unknown";

  ok(res, 200, null, GENERIC_MESSAGE);

  setImmediate(() => {
    requestPasswordReset(email, ip, userAgent).catch((error: unknown) =>
      console.error("[auth] No se pudo procesar el pedido de recuperación:", error)
    );
  });
});
