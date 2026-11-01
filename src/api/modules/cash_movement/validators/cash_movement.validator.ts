import { body, param } from "express-validator";
import { moneyAmountRule, moneyDateRule } from "../../../../core/validators/money.validator";
import { DataBase } from "../../../../database";

export const createCashMovementValidator = [
  body("direction").isIn(["income", "expense"]).withMessage("El tipo de movimiento debe ser ingreso o egreso"),
  body("category")
    .not()
    .isEmpty()
    .withMessage("La categoría es obligatoria")
    .bail()
    .isString()
    .isLength({ max: 50 })
    .withMessage("Máximo 50 caracteres"),
  moneyAmountRule("amount"),
  body("description").optional({ values: "falsy" }).isString().isLength({ max: 500 }).withMessage("Máximo 500 caracteres"),
  // Fecha nunca futura (el frontend ya la bloquea en el calendario, pero el
  // backend no confía en eso — CLAUDE.md sección 12), comparada en hora de
  // Lima: con instantes UTC se colaba la fecha de mañana desde las 7 p. m.
  moneyDateRule("occurred_at", "La fecha es obligatoria"),
  // Solo se valida la FORMA acá. La existencia Y la pertenencia a la empresa
  // del caller las valida el controller (createCashMovementController), que
  // es el único que conoce req.user — repetir el "existe?" en el validator
  // era una consulta extra por request que además daba una respuesta más
  // débil (confirmaba que un id ajeno existe antes de que el controller lo
  // rechace por empresa).
  // Solo la usa el Super Administrador (elige la empresa); para un usuario
  // de empresa el controller siempre usa la suya.
  body("company_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La empresa debe ser un id válido"),
  body("quotation_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cotización debe ser un id válido"),
  body("purchase_order_id")
    .optional({ values: "null" })
    .isInt({ gt: 0 })
    .withMessage("La orden de compra debe ser un id válido"),
  body("payment_account_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cuenta seleccionada no es válida"),
];

const paramCashMovementIdValidator = param("id")
  .not()
  .isEmpty()
  .withMessage("El id del movimiento es obligatorio")
  .bail()
  .isInt({ gt: 0 })
  .withMessage("El id del movimiento debe ser un número entero positivo")
  .bail()
  .custom(async (value: string) => {
    const movement = await DataBase.instance.cash_movement.findOne({ where: { id: Number(value) } });
    if (!movement) throw new Error("El movimiento con el ID proporcionado no existe.");
    return true;
  })
  .bail();

export const disableCashMovementValidator = [paramCashMovementIdValidator];
