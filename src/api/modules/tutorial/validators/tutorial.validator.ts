import { body, param, query } from "express-validator";
import { LESSON_CODE_PATTERN, LESSON_PREPARATIONS } from "../types/tutorial.types";

// Modo enseñanza (21-nov). La lección la define el frontend; aquí solo se
// valida la forma del código y del avance.
export const prepareLessonValidator = [
  body("preparation").isIn([...LESSON_PREPARATIONS]).withMessage("Preparación de lección inválida"),
];

export const saveProgressValidator = [
  param("code").matches(LESSON_CODE_PATTERN).withMessage("La lección no es válida"),
  body("step_index").isInt({ min: 0, max: 200 }).withMessage("El paso no es válido").toInt(),
  body("completed").isBoolean().withMessage("Indica si la lección se completó").toBoolean(),
];

export const teamProgressValidator = [
  query("companyId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("Empresa inválida"),
];
