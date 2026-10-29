import { body, param } from "express-validator";

export const payEmployeeDebtValidator = [
  param("userId")
    .not()
    .isEmpty()
    .withMessage("El id del trabajador es obligatorio")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("El id del trabajador debe ser un número entero positivo"),
  // Cuenta desde la que se le repone (vacío = efectivo); que sea de la
  // empresa lo valida el controller.
  body("payment_account_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cuenta seleccionada no es válida"),
  // Monto a abonar ahora (pagos parciales, pedido de QA) — que no supere el
  // total pendiente lo valida el service, que es quien conoce ese total.
  body("amount")
    .isFloat({ gt: 0, max: 99999999.99 })
    .withMessage("El monto a reponer debe ser mayor a 0"),
];
