import { body, param } from "express-validator";
import { DataBase } from "../../../../database";
import { CASH_PAYMENT_METHOD } from "../../quotation/validators/quotation.validator";

const paramPaymentIdValidator = param("id")
  .not()
  .isEmpty()
  .withMessage("El id del pago es obligatorio")
  .bail()
  .isInt({ gt: 0 })
  .withMessage("El id del pago debe ser un número entero positivo")
  .bail()
  .custom(async (value: string) => {
    const payment = await DataBase.instance.quotation_payment.findOne({ where: { id: Number(value) } });
    if (!payment) throw new Error("El pago con el ID proporcionado no existe.");
    return true;
  });

export const updatePaymentValidator = [
  paramPaymentIdValidator,
  body("amount").isFloat({ gt: 0, max: 99999999.99 }).withMessage("El monto debe ser mayor a 0"),
  body("method")
    .not()
    .isEmpty()
    .withMessage("El método de pago es obligatorio")
    .bail()
    .isString()
    .isLength({ max: 50 })
    .withMessage("Máximo 50 caracteres"),
  body("paid_at").isISO8601().withMessage("La fecha de pago es obligatoria"),
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

export const disablePaymentValidator = [paramPaymentIdValidator];
