import { body, param } from "express-validator";
import { DataBase } from "../../../../database";
import { QUOTATION_STATUSES } from "../model/quotation.model";
import { QUOTATION_ITEM_PRICING_MODES } from "../model/quotation_item.model";

export const createQuotationValidator = [
  body("company_id")
    .not()
    .isEmpty()
    .withMessage("La empresa es obligatoria")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("La empresa debe ser un id válido"),
  body("client_id")
    .not()
    .isEmpty()
    .withMessage("El cliente es obligatorio")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("El cliente debe ser un id válido"),
  // Tienda: opcional (una empresa puede tener una sola tienda y no
  // obligar a elegir), pero si se manda debe ser un id válido — el
  // service valida que pertenezca a la misma empresa de la cotización.
  body("business_unit_id").optional({ values: "null" }).isInt({ gt: 0 }),
  body("notes").optional({ values: "null" }).isString().isLength({ max: 500 }).withMessage("Máximo 500 caracteres"),
  body("valid_until").optional({ values: "null" }).isISO8601(),
  // Opcional: la cotización sale a nombre de otra persona/empresa en el
  // PDF, pero el cliente vinculado (client_id) sigue siendo el mismo.
  body("billing_name").optional({ values: "null" }).isString().isLength({ max: 255 }).withMessage("Máximo 255 caracteres"),
  body("billing_document_number")
    .optional({ values: "null" })
    .isString()
    .isLength({ max: 20 })
    .withMessage("Máximo 20 caracteres"),
  body("production_days")
    .optional({ values: "null" })
    .isInt({ min: 1, max: 365 })
    .withMessage("Los días de producción deben ser un número entero entre 1 y 365"),
  body("items").isArray({ min: 1 }).withMessage("La cotización debe tener al menos un producto"),
  body("items.*.product_id").isInt({ gt: 0 }).withMessage("Cada item necesita un producto válido"),
  // Opcional en la forma: si es obligatoria o no depende del producto
  // (requires_customization), y eso lo valida el service.
  body("items.*.technique_id")
    .optional({ values: "null" })
    .isInt({ gt: 0 })
    .withMessage("La técnica debe ser un id válido"),
  // La cantidad es siempre obligatoria: cada modo de precio es una tarifa
  // por unidad, no el precio de un lote cerrado.
  body("items.*.quantity").isInt({ gt: 0 }).withMessage("La cantidad debe ser un número entero positivo"),
  body("items.*.pricing_mode")
    .isIn(QUOTATION_ITEM_PRICING_MODES)
    .withMessage("El modo de precio del item no es válido"),
  body("items.*.custom_price")
    .optional({ values: "null" })
    .isFloat({ min: 0, max: 99999999.99 })
    .withMessage("El precio personalizado debe ser un número positivo"),
  // Extra de la técnica cuando pricing_mode="custom" (pedido explícito del
  // usuario: "cuando se le da personalizado debe darte para colocar el
  // precio del producto y de la técnica") — opcional, si no se manda cae a
  // technique.price_unit (ver quotation.service.ts -> resolveTechniqueTierExtra).
  body("items.*.custom_technique_price")
    .optional({ values: "null" })
    .isFloat({ min: 0, max: 99999999.99 })
    .withMessage("El precio personalizado de la técnica debe ser un número positivo"),
  // "custom" además necesita un precio propio del item; los demás modos lo
  // resuelven desde el catálogo del producto.
  body("items").custom((items: Array<{ pricing_mode?: string; custom_price?: number | null }>) => {
    const missingPrice = items.find((item) => item.pricing_mode === "custom" && item.custom_price == null);
    if (missingPrice) throw new Error("Los items con precio personalizado necesitan un precio");
    return true;
  }),
  body("includes_delivery").optional().isBoolean().withMessage("Debe ser verdadero o falso"),
  body("includes_design").optional().isBoolean().withMessage("Debe ser verdadero o falso"),
  body("includes_igv").optional().isBoolean().withMessage("Debe ser verdadero o falso"),
];

const paramQuotationIdValidator = param("id")
  .not()
  .isEmpty()
  .withMessage("El id de la cotización es obligatorio")
  .bail()
  .isInt({ gt: 0 })
  .withMessage("El id de la cotización debe ser un número entero positivo")
  .bail()
  .custom(async (value: string) => {
    const quotation = await DataBase.instance.quotation.findOne({ where: { id: Number(value) } });
    if (!quotation) throw new Error("La cotización con el ID proporcionado no existe.");
    return true;
  })
  .bail();

export const updateQuotationValidator = [
  paramQuotationIdValidator,
  body("notes").optional({ values: "null" }).isString().isLength({ max: 500 }).withMessage("Máximo 500 caracteres"),
  body("valid_until").optional({ values: "null" }).isISO8601(),
  body("billing_name").optional({ values: "null" }).isString().isLength({ max: 255 }).withMessage("Máximo 255 caracteres"),
  body("billing_document_number")
    .optional({ values: "null" })
    .isString()
    .isLength({ max: 20 })
    .withMessage("Máximo 20 caracteres"),
  body("production_days")
    .optional({ values: "null" })
    .isInt({ min: 1, max: 365 })
    .withMessage("Los días de producción deben ser un número entero entre 1 y 365"),
  body("includes_delivery").optional().isBoolean().withMessage("Debe ser verdadero o falso"),
  body("includes_design").optional().isBoolean().withMessage("Debe ser verdadero o falso"),
  body("includes_igv").optional().isBoolean().withMessage("Debe ser verdadero o falso"),
];

export const getQuotationValidator = [paramQuotationIdValidator];

export const changeStatusValidator = [
  paramQuotationIdValidator,
  body("status").isIn(QUOTATION_STATUSES).withMessage("Estado inválido"),
  // Adelanto opcional al aceptar (mismas reglas que un pago normal).
  body("advance_payment").optional({ values: "null" }).isObject().withMessage("El adelanto no es válido"),
  body("advance_payment.amount")
    .if(body("advance_payment").exists({ values: "null" }))
    .isFloat({ gt: 0, max: 99999999.99 })
    .withMessage("El monto del adelanto debe ser mayor a 0"),
  body("advance_payment.method")
    .if(body("advance_payment").exists({ values: "null" }))
    .isString()
    .notEmpty()
    .withMessage("El método de pago del adelanto es obligatorio")
    .bail()
    .isLength({ max: 50 })
    .withMessage("Máximo 50 caracteres"),
  body("advance_payment.paid_at")
    .if(body("advance_payment").exists({ values: "null" }))
    .isISO8601()
    .withMessage("La fecha del adelanto es obligatoria"),
  body("advance_payment.notes").optional({ values: "null" }).isString().isLength({ max: 500 }).withMessage("Máximo 500 caracteres"),
  body("advance_payment.operation_number")
    .optional({ values: "null" })
    .isString()
    .isLength({ max: 50 })
    .withMessage("Máximo 50 caracteres"),
  body("advance_payment.operation_number").custom((value, { req }) => {
    const advance = req.body.advance_payment as { method?: string } | null | undefined;
    if (!advance || advance.method === CASH_PAYMENT_METHOD) return true;
    if (!value) throw new Error("El número de operación es obligatorio para pagos que no son en efectivo");
    return true;
  }),
  body("advance_payment.payment_account_id")
    .optional({ values: "null" })
    .isInt({ gt: 0 })
    .withMessage("La cuenta seleccionada no es válida"),
];

export const changeItemStageValidator = [
  param("itemId")
    .not()
    .isEmpty()
    .withMessage("El id del item es obligatorio")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("El id del item debe ser un número entero positivo"),
  body("stage_id")
    .not()
    .isEmpty()
    .withMessage("La etapa es obligatoria")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("La etapa debe ser un id válido"),
];

// Identificador estable (general_variable.prefix_id) del método "Efectivo"
// dentro del catálogo payment_method — es el único método que NO exige
// número de operación.
export const CASH_PAYMENT_METHOD = "cash";

export const createQuotationPaymentValidator = [
  paramQuotationIdValidator,
  body("amount").isFloat({ gt: 0, max: 99999999.99 }).withMessage("El monto debe ser mayor a 0"),
  // Columna VARCHAR(50) — sin este tope, un método muy largo produce el
  // mismo error crudo de MySQL que ya se corrigió para las notas.
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
  // Todo pago que no sea en efectivo debe traer número de operación para
  // poder conciliarlo después (pedido explícito del usuario).
  body("operation_number").custom((value, { req }) => {
    if (req.body.method === CASH_PAYMENT_METHOD) return true;
    if (!value) throw new Error("El número de operación es obligatorio para pagos que no son en efectivo");
    return true;
  }),
  // Solo la forma: que la cuenta sea de la empresa, y si es obligatoria, lo
  // valida el service (resolvePaymentAccountId).
  body("payment_account_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cuenta seleccionada no es válida"),
];

export const createQuotationExpenseValidator = [
  paramQuotationIdValidator,
  body("description")
    .not()
    .isEmpty()
    .withMessage("La descripción es obligatoria")
    .bail()
    .isString()
    .isLength({ max: 300 })
    .withMessage("Máximo 300 caracteres"),
  body("amount").isFloat({ gt: 0, max: 99999999.99 }).withMessage("El monto debe ser mayor a 0"),
  // Columna VARCHAR(50) — mismo motivo que "method" arriba.
  body("category").optional({ values: "null" }).isString().isLength({ max: 50 }).withMessage("Máximo 50 caracteres"),
  body("spent_at").isISO8601().withMessage("La fecha del gasto es obligatoria"),
];
