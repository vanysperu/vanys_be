import { query } from "express-validator";

export const queryParamsDtoValidator = [
  query("all").optional().isBoolean().withMessage("Traer todos debe ser un boolean"),

  query("byUserId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("El identificador del usuario debe ser un número entero positivo"),
];
