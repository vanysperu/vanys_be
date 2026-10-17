import { Router } from "express";
import {
  recoveryUserAccountController,
  sendCodeForRecoveryPasswordController,
  signInController,
  signOutController,
  verifyRecoveryCodeController,
} from "../controllers/auth.controller";
import {
  recoveryUserAccountValidator,
  sendCodeForRecoveryValidator,
  signInValidator,
  verifyRecoveryCodeValidator,
} from "../validators/auth.validator";
import { allValidator } from "../../../../middlewares/error-validator";

export const unprotectedRouter: Router = Router();
export const protectedRouter: Router = Router();

// Iniciar sesión
unprotectedRouter.post(
  "/signin",
  signInValidator,
  allValidator,
  signInController
);

protectedRouter.post("/signout", signOutController);

// Recuperar cuenta/password
unprotectedRouter.post(
  "/recovery/send-code",
  sendCodeForRecoveryValidator,
  allValidator,
  sendCodeForRecoveryPasswordController
);

unprotectedRouter.post(
  "/recovery/verify-code",
  verifyRecoveryCodeValidator,
  allValidator,
  verifyRecoveryCodeController
);
unprotectedRouter.post(
  "/recovery/user-account",
  recoveryUserAccountValidator,
  allValidator,
  recoveryUserAccountController
);

