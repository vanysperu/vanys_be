import { body, query } from "express-validator";
import { FLOW_MODES } from "../model/production_workflow.model";
import { STAGE_CATEGORIES } from "../model/production_workflow_stage.model";
import { MAX_TOTAL_STAGES } from "../services/save_config.service";

// Solo el Super Administrador manda la empresa (la elige en la pantalla); a un
// usuario de empresa se le ignora y se usa la suya (ver resolveWorkflowCompanyId).
const companyIdQuery = query("companyId").optional({ values: "falsy" }).isInt({ min: 1 }).withMessage("La empresa no es válida");

export const workflowCompanyQueryValidator = [companyIdQuery];

export const saveWorkflowConfigValidator = [
  body("company_id").optional({ values: "null" }).isInt({ min: 1 }).withMessage("La empresa no es válida"),
  body("flowMode").isIn(FLOW_MODES).withMessage("El modo de avance debe ser lineal o libre"),
  body("allowBackward").isBoolean().withMessage("Indica si se puede retroceder de etapa").toBoolean(),
  body("stages")
    .isArray({ min: 1, max: MAX_TOTAL_STAGES })
    .withMessage(`El flujo necesita entre 1 y ${MAX_TOTAL_STAGES} columnas`),
  body("stages.*.id").optional({ values: "null" }).isInt({ min: 1 }).withMessage("Una de las columnas no es válida").toInt(),
  body("stages.*.name")
    .isString()
    .trim()
    .isLength({ min: 1, max: 60 })
    .withMessage("Cada columna necesita un nombre de hasta 60 caracteres"),
  body("stages.*.color").matches(/^#[0-9A-Fa-f]{6}$/).withMessage("El color de la columna debe ser un hex como #1F5FC0"),
  body("stages.*.category").isIn(STAGE_CATEGORIES).withMessage("El tipo de columna debe ser: por hacer, en curso o terminado"),
  body("stages.*.active").isBoolean().withMessage("Indica si la columna está activa").toBoolean(),
  body("stages.*.moveItemsToStageId")
    .optional({ values: "null" })
    .isInt({ min: 1 })
    .withMessage("La columna destino no es válida")
    .toInt(),
];
