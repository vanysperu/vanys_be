import { Router } from "express";

import { verifyAccess } from "../../../../middlewares/user-access";
import {
  getUserAccountController,
  listUsersController,
  createUserController,
  updateUserController,
  disableEnabledUserForAdminController,
  updateMyUserPasswordController,
  findUserInformationByIdController,
  batchDisableUserController,
} from "../controllers/user.controller";
import {
  IdValidator,
  batchDisableUserValidator,
  changePasswordValidator,
  createUserDtoValidator,
  updateUserDtoValidator,
} from "../validators/user.validator";
import { allValidator } from "../../../../middlewares/error-validator";
import { sendPasswordLinkController } from "../controllers/send_password_link.controller";
import { sendPasswordLinkValidator } from "../validators/password_link.validator";
import { paginationValidator } from "../../../validators/pagination.validator";

export const router: Router = Router();

router.get("/user-account", verifyAccess, getUserAccountController);

router.post(
  "/create",
  verifyAccess,
  createUserDtoValidator,
  allValidator,
  createUserController
);

router.put(
  "/update/:id",
  verifyAccess,
  IdValidator,
  updateUserDtoValidator,
  allValidator,
  updateUserController
);

router.get(
  "/find/:id",
  verifyAccess,
  IdValidator,
  allValidator,
  findUserInformationByIdController
);

router.get(
  "/list",
  verifyAccess,
  paginationValidator,
  allValidator,
  listUsersController
);
router.put(
  "/disable/:id",
  verifyAccess,
  IdValidator,
  allValidator,
  disableEnabledUserForAdminController
);
router.put(
  "/batch/disable",
  verifyAccess,
  batchDisableUserValidator,
  allValidator,
  batchDisableUserController
);
// Reenviar invitación / enviar enlace para restablecer (Sprint 2, ítem 4).
router.post(
  "/:id/password-link",
  verifyAccess,
  sendPasswordLinkValidator,
  allValidator,
  sendPasswordLinkController
);
router.patch(
  "/change/password",
  verifyAccess,
  changePasswordValidator,
  allValidator,
  updateMyUserPasswordController
);
