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
router.patch(
  "/change/password",
  verifyAccess,
  changePasswordValidator,
  allValidator,
  updateMyUserPasswordController
);
