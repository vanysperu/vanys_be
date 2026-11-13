import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { saveWorkflowConfigValidator, workflowCompanyQueryValidator } from "../validators/production_workflow.validator";
import { getWorkflowConfigController } from "../controllers/get_config.controller";
import { saveWorkflowConfigController } from "../controllers/save_config.controller";
import { getWorkflowBoardController } from "../controllers/get_board.controller";

export const router: Router = Router();

// Configuración del flujo (solo roles con la vista "Flujo de producción").
router.get("/config", verifyAccess, workflowCompanyQueryValidator, allValidator, getWorkflowConfigController);
router.put("/config", verifyAccess, saveWorkflowConfigValidator, allValidator, saveWorkflowConfigController);
// Columnas del kanban de cotizaciones (cualquiera que vea cotizaciones).
router.get("/board", verifyAccess, workflowCompanyQueryValidator, allValidator, getWorkflowBoardController);
