import { param } from "express-validator";

export const payEmployeeDebtValidator = [
  param("userId")
    .not()
    .isEmpty()
    .withMessage("El id del trabajador es obligatorio")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("El id del trabajador debe ser un número entero positivo"),
];
