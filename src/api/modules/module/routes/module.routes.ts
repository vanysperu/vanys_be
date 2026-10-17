import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { requireSystemRole } from "../../../../middlewares/require-system-role";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  createModuleValidator,
  disableModuleValidator,
  updateModuleValidator,
} from "../validators/module.validator";
import {
  createModuleController,
  disableModuleController,
  listModulesController,
  updateModuleController,
} from "../controllers/module.controller";

export const router: Router = Router();

// Catálogo compartido de plataforma: cualquier empresa puede LEER (para armar
// el árbol de accesos), pero solo un usuario is_system puede darlo de alta o
// modificarlo — no es de una empresa en particular.
router.get("/list", verifyAccess, paginationValidator, allValidator, listModulesController);
router.post("/create", verifyAccess, requireSystemRole, createModuleValidator, allValidator, createModuleController);
router.put("/update/:id", verifyAccess, requireSystemRole, updateModuleValidator, allValidator, updateModuleController);
router.put("/disable/:id", verifyAccess, requireSystemRole, disableModuleValidator, allValidator, disableModuleController);
