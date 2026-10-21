import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { requireSystemRole } from "../../../../middlewares/require-system-role";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  createResourceValidator,
  disableResourceValidator,
  getResourceByIdValidator,
  updateResourceValidator,
} from "../validators/resource.validator";
import {
  createResourceController,
  disableResourceController,
  getResourceByIdController,
  listResourcesController,
  updateResourceController,
} from "../controllers/resource.controller";

export const router: Router = Router();

// Mismo criterio que module.routes.ts: catálogo compartido de plataforma.
router.get("/list", verifyAccess, requireSystemRole, paginationValidator, allValidator, listResourcesController);
router.get("/:id", verifyAccess, requireSystemRole, getResourceByIdValidator, allValidator, getResourceByIdController);
router.post("/create", verifyAccess, requireSystemRole, createResourceValidator, allValidator, createResourceController);
router.put("/update/:id", verifyAccess, requireSystemRole, updateResourceValidator, allValidator, updateResourceController);
router.put("/disable/:id", verifyAccess, requireSystemRole, disableResourceValidator, allValidator, disableResourceController);
