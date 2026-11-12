import { Router } from "express";
import { signInController, signOutController } from "../controllers/auth.controller";
import { forgotPasswordController } from "../controllers/forgot_password.controller";
import { checkPasswordLinkController } from "../controllers/check_password_link.controller";
import { completePasswordLinkController } from "../controllers/complete_password_link.controller";
import {
  checkPasswordLinkValidator,
  completePasswordLinkValidator,
  forgotPasswordValidator,
  signInValidator,
} from "../validators/auth.validator";
import { allValidator } from "../../../../middlewares/error-validator";
import { rateLimit } from "../../../../core/middlewares/rateLimit";

export const unprotectedRouter: Router = Router();
export const protectedRouter: Router = Router();

const MINUTE = 60_000;

// Iniciar sesión
unprotectedRouter.post("/signin", signInValidator, allValidator, signInController);

protectedRouter.post("/signout", signOutController);

// Enlaces para crear o recuperar la contraseña (Sprint 2, ítem 4). Públicos
// por diseño, como /signin: se llega desde el correo sin sesión. Reemplazan a
// las rutas /recovery/* (código de 4 dígitos sin vencimiento ni límite de
// intentos, que permitían tomar cualquier cuenta). Cada una con límite por IP,
// holgado para una oficina con varias personas detrás de la misma IP: el token
// de 32 bytes no se puede adivinar, el límite solo frena el abuso.
unprotectedRouter.post(
  "/password/forgot",
  rateLimit({ name: "password-forgot", windowMs: 60 * MINUTE, max: 20 }),
  forgotPasswordValidator,
  allValidator,
  forgotPasswordController
);

unprotectedRouter.post(
  "/password/link/check",
  rateLimit({ name: "password-link-check", windowMs: 10 * MINUTE, max: 60 }),
  checkPasswordLinkValidator,
  allValidator,
  checkPasswordLinkController
);

unprotectedRouter.post(
  "/password/link/complete",
  rateLimit({ name: "password-link-complete", windowMs: 10 * MINUTE, max: 30 }),
  completePasswordLinkValidator,
  allValidator,
  completePasswordLinkController
);
