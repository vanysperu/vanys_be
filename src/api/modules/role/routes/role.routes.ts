import { Router } from "express";

import { verifyAccess } from "../../../../middlewares/user-access";
import {
  listRolesController,
  createRoleController,
  updateRoleController,
  disableEnabledRoleController,
} from "../controllers/role.controller";
import {
  createRoleDtoValidator,
  disableRoleValidator,
  updateRoleDtoValidator,
} from "../validators/role.validator";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";

export const router: Router = Router();

router.get(
  "/list",
  verifyAccess,
  paginationValidator,
  allValidator,
  listRolesController
);

router.post(
  "/create",
  verifyAccess,
  createRoleDtoValidator,
  allValidator,
  createRoleController
);

router.put(
  "/update/:id",
  verifyAccess,
  updateRoleDtoValidator,
  allValidator,
  updateRoleController
);

router.put(
  "/disable/:id",
  verifyAccess,
  disableRoleValidator,
  allValidator,
  disableEnabledRoleController
);
