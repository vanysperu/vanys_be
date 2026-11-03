import { body, param } from "express-validator";
import { moneyAmountRule, moneyDateRule } from "../../../../core/validators/money.validator";
import { correctionIdParamRule, correctionReasonRule } from "../../money_correction/validators/money_correction.validator";
import { CASH_PAYMENT_METHOD } from "../../quotation/validators/quotation.validator";
import { optionalAdjustmentReasonRule } from "../../cash_movement/validators/adjustment_reason.validator";

// Solo la FORMA del id: la existencia y el alcance (empresa/tienda) los
// resuelve el service, y un id ajeno responde igual que uno que no existe
// (antes el validator confirmaba que un id de otra empresa existía).
const paramPaymentIdValidator = param("id")
  .isInt({ gt: 0 })
  .withMessage("El id del pago debe ser un número entero positivo");

export const updatePaymentValidator = [
  paramPaymentIdValidator,
  // Obligatorio: una corrección de dinero sin explicación no se puede auditar.
  correctionReasonRule(),
  moneyAmountRule("amount"),
  body("method")
    .not()
    .isEmpty()
    .withMessage("El método de pago es obligatorio")
    .bail()
    .isString()
    .isLength({ max: 50 })
    .withMessage("Máximo 50 caracteres"),
  moneyDateRule("paid_at", "La fecha de pago es obligatoria"),
  body("notes").optional({ values: "null" }).isString().isLength({ max: 500 }).withMessage("Máximo 500 caracteres"),
  body("operation_number")
    .optional({ values: "null" })
    .isString()
    .isLength({ max: 50 })
    .withMessage("Máximo 50 caracteres"),
  body("operation_number").custom((value, { req }) => {
    if (req.body.method === CASH_PAYMENT_METHOD) return true;
    if (!value) throw new Error("El número de operación es obligatorio para pagos que no son en efectivo");
    return true;
  }),
  body("payment_account_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cuenta seleccionada no es válida"),
];

// Motivo opcional: obligatorio solo si el pago es de un mes cerrado (ajuste).
export const disablePaymentValidator = [paramPaymentIdValidator, optionalAdjustmentReasonRule()];

export const findPaymentValidator = [paramPaymentIdValidator];

// GET /payment/:id/corrections?page=&limit=
export const listPaymentCorrectionsValidator = [correctionIdParamRule("id")];
