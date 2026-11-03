import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { requireSystemRole } from "../../../../middlewares/require-system-role";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  apiKeyIdValidator,
  createApiKeyValidator,
  listApiKeysValidator,
  updateApiKeyValidator,
} from "../validators/api_key.validator";
import { listApiKeysController } from "../controllers/list.controller";
import { createApiKeyController } from "../controllers/create.controller";
import { updateApiKeyController } from "../controllers/update.controller";
import { disableApiKeyController } from "../controllers/disable.controller";

// Pantalla "API keys": EXCLUSIVA del Super Administrador (pedido explícito
// del usuario). Una key da acceso sin sesión a crear clientes y cotizaciones
// de una empresa, así que todo exige requireSystemRole además del RBAC, y el
// módulo es system-only (core/rbac/systemOnlyModules.ts): no se le puede
// otorgar a ningún rol de empresa.
export const router: Router = Router();

router.get("/list", verifyAccess, requireSystemRole, paginationValidator, listApiKeysValidator, allValidator, listApiKeysController);
router.post("/create", verifyAccess, requireSystemRole, createApiKeyValidator, allValidator, createApiKeyController);
router.put("/update/:id", verifyAccess, requireSystemRole, updateApiKeyValidator, allValidator, updateApiKeyController);
router.put("/disable/:id", verifyAccess, requireSystemRole, apiKeyIdValidator, allValidator, disableApiKeyController);
