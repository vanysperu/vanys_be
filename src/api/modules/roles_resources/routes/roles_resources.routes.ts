import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { requireSystemRole } from "../../../../middlewares/require-system-role";
import { allValidator } from "../../../../middlewares/error-validator";
import { getRoleResourceTreeValidator, setRoleResourcesValidator } from "../validators/roles_resources.validator";
import { getRoleResourceTreeController, setRoleResourcesController } from "../controllers/roles_resources.controller";

export const router: Router = Router();

// Ver y asignar los accesos de un rol es exclusivo del Super Administrador
// (core/rbac/systemOnlyModules.ts).
router.get(
  "/roles/:roleId/resources",
  verifyAccess,
  requireSystemRole,
  getRoleResourceTreeValidator,
  allValidator,
  getRoleResourceTreeController
);
router.put(
  "/roles/:roleId/resources",
  verifyAccess,
  requireSystemRole,
  setRoleResourcesValidator,
  allValidator,
  setRoleResourcesController
);
