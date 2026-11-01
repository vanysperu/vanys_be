import { body, param, query } from "express-validator";
import { moneyAmountRule, moneyDateRule } from "../../../../core/validators/money.validator";

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
  moneyAmountRule("amount", "El monto a reponer debe ser mayor a 0"),
];

export const voidEmployeeDebtPaymentValidator = [
  param("id")
    .not()
    .isEmpty()
    .withMessage("El id de la reposición es obligatorio")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("El id de la reposición debe ser un número entero positivo"),
];

export const employeeDebtDetailValidator = [
  query("userId")
    .not()
    .isEmpty()
    .withMessage("Indica el trabajador")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("El trabajador debe ser un id válido"),
];

// Deuda manual: qué se pagó, de qué tipo de gasto, cuánto y cuándo. Que el
// trabajador sea de la empresa, la categoría exista y la tienda sea de la
// empresa lo valida el controller (necesita la sesión).
export const createManualEmployeeDebtValidator = [
  body("company_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La empresa debe ser un id válido"),
  body("business_unit_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La tienda debe ser un id válido"),
  body("user_id")
    .not()
    .isEmpty()
    .withMessage("Selecciona el trabajador que puso el dinero")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("El trabajador debe ser un id válido"),
  body("description")
    .isString()
    .withMessage("Describe qué se pagó")
    .bail()
    .trim()
    .isLength({ min: 3, max: 300 })
    .withMessage("La descripción debe tener entre 3 y 300 caracteres"),
  body("category")
    .isString()
    .withMessage("Selecciona la categoría del gasto")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Selecciona la categoría del gasto")
    .isLength({ max: 50 })
    .withMessage("Máximo 50 caracteres"),
  moneyAmountRule("amount"),
  moneyDateRule("incurred_at", "Indica la fecha en que se pagó"),
];

export const cancelManualEmployeeDebtValidator = [
  param("id")
    .not()
    .isEmpty()
    .withMessage("El id de la deuda es obligatorio")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("El id de la deuda debe ser un número entero positivo"),
];
