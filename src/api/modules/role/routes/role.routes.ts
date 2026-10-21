import { Router } from "express";

import { verifyAccess } from "../../../../middlewares/user-access";
import { requireSystemRole } from "../../../../middlewares/require-system-role";
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

// Listar roles queda abierto (con su propio permiso RBAC): el formulario de
// Usuarios lo necesita para el selector de rol, y el service ya limita a un
// usuario de empresa a los roles de SU empresa + las plantillas.
router.get(
  "/list",
  verifyAccess,
  paginationValidator,
  allValidator,
  listRolesController
);

// Crear/editar/deshabilitar roles es exclusivo del Super Administrador
// (pedido explícito del usuario: "Roles y accesos" solo lo ve el Super
// Administrador). Ver core/rbac/systemOnlyModules.ts.
router.post(
  "/create",
  verifyAccess,
  requireSystemRole,
  createRoleDtoValidator,
  allValidator,
  createRoleController
);

router.put(
  "/update/:id",
  verifyAccess,
  requireSystemRole,
  updateRoleDtoValidator,
  allValidator,
  updateRoleController
);

router.put(
  "/disable/:id",
  verifyAccess,
  requireSystemRole,
  disableRoleValidator,
  allValidator,
  disableEnabledRoleController
);
