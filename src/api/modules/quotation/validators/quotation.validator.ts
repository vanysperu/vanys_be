import { body, param, query } from "express-validator";
import { moneyAmountRule, moneyDateRule } from "../../../../core/validators/money.validator";
import {
  correctionHistoryValidator,
  correctionIdParamRule,
  correctionReasonRule,
} from "../../money_correction/validators/money_correction.validator";
import { DataBase } from "../../../../database";
import { optionalAdjustmentReasonRule } from "../../cash_movement/validators/adjustment_reason.validator";
import { QUOTATION_STATUSES } from "../model/quotation.model";
import { QUOTATION_ITEM_PRICING_MODES } from "../model/quotation_item.model";

// Reglas de los items, compartidas por crear y por "completar" una
// cotización que llegó desde la web (PUT /quotation/:id/items).
const quotationItemsRules = [
  body("items").isArray({ min: 1 }).withMessage("La cotización debe tener al menos un producto"),
  body("items.*.product_id").isInt({ gt: 0 }).withMessage("Cada item necesita un producto válido"),
  // Opcional en la forma: si es obligatoria o no depende del producto
  // (requires_customization), y eso lo valida el service.
  body("items.*.technique_id")
    .optional({ values: "null" })
    .isInt({ gt: 0 })
    .withMessage("La técnica debe ser un id válido"),
  // Variante del item: que el color sea del producto lo valida el service.
  body("items.*.product_code")
    .optional({ values: "null" })
    .isString()
    .trim()
    .isLength({ max: 60 })
    .withMessage("El código tiene máximo 60 caracteres"),
  body("items.*.color")
    .optional({ values: "null" })
    .isString()
    .trim()
    .isLength({ max: 60 })
    .withMessage("El color tiene máximo 60 caracteres"),
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
];

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
  ...quotationItemsRules,
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

// GET /quotation/board — columnas del tablero (todo opcional).
const optionalId = (field: string, label: string) =>
  query(field).optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage(`${label} no es válido`);

export const quotationBoardValidator = [
  query("perStatus").optional({ values: "falsy" }).isInt({ min: 1, max: 50 }).withMessage("perStatus va de 1 a 50"),
  optionalId("companyId", "La empresa"),
  optionalId("businessUnitId", "La tienda"),
  optionalId("clientId", "El cliente"),
  query("dateFrom").optional({ values: "falsy" }).isISO8601().withMessage("dateFrom no es una fecha válida"),
  query("dateTo").optional({ values: "falsy" }).isISO8601().withMessage("dateTo no es una fecha válida"),
];

// PUT /quotation/:id/items — edita una cotización en cualquier estado:
// items con las mismas reglas que crear + los datos que se eligen al cotizar.
export const completeQuotationValidator = [
  paramQuotationIdValidator,
  ...quotationItemsRules,
  // Con id se actualiza ese item; sin id, es un producto nuevo.
  body("items.*.id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("El item no es válido"),
  body("notes").optional({ values: "null" }).isString().isLength({ max: 500 }).withMessage("Máximo 500 caracteres"),
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
  // Al pasar a Finalizada: ¿emitimos factura? (el archivo se sube aparte).
  body("invoice_issued").optional().isBoolean().withMessage("invoice_issued debe ser verdadero o falso").toBoolean(),
  // Adelanto opcional al aceptar (mismas reglas que un pago normal).
  body("advance_payment").optional({ values: "null" }).isObject().withMessage("El adelanto no es válido"),
  moneyAmountRule("advance_payment.amount", "El monto del adelanto debe ser mayor a 0", {
    onlyIf: body("advance_payment").exists({ values: "null" }),
  }),
  body("advance_payment.method")
    .if(body("advance_payment").exists({ values: "null" }))
    .isString()
    .notEmpty()
    .withMessage("El método de pago del adelanto es obligatorio")
    .bail()
    .isLength({ max: 50 })
    .withMessage("Máximo 50 caracteres"),
  moneyDateRule("advance_payment.paid_at", "La fecha del adelanto es obligatoria", {
    onlyIf: body("advance_payment").exists({ values: "null" }),
  }),
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
  moneyAmountRule("amount"),
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
  moneyDateRule("paid_at", "La fecha de pago es obligatoria"),
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
  moneyAmountRule("amount"),
  // Columna VARCHAR(50) — mismo motivo que "method" arriba.
  body("category").optional({ values: "null" }).isString().isLength({ max: 50 }).withMessage("Máximo 50 caracteres"),
  moneyDateRule("spent_at", "La fecha del gasto es obligatoria"),
  // Cuenta de la empresa desde la que se pagó (vacío = efectivo); que sea de
  // la empresa de la cotización y esté activa lo valida el controller.
  body("payment_account_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cuenta seleccionada no es válida"),
];

// ---- Corrección / anulación de gastos manuales ----

// Solo la FORMA del id: existencia y alcance los resuelve el service (un id
// ajeno responde 404, igual que uno que no existe).
export const quotationExpenseIdValidator = [correctionIdParamRule("id")];

// PUT /quotation/expense/disable/:id — motivo opcional: obligatorio solo si el
// gasto es de un mes cerrado (se registra como ajuste, cierre de caja).
export const toggleQuotationExpenseValidator = [correctionIdParamRule("id"), optionalAdjustmentReasonRule()];

const presentIn = (field: string) => body(field).exists();

// PUT /quotation/expense/update/:id — cada campo es opcional (ausente = se
// queda como está) y, si viene, pasa por las MISMAS reglas que al crear.
export const correctQuotationExpenseValidator = [
  correctionIdParamRule("id"),
  // La cotización de un gasto no se corrige: se anula y se registra en la
  // correcta.
  body("quotation_id")
    .not()
    .exists()
    .withMessage("La cotización de un gasto no se corrige: anula este gasto y regístralo en la cotización correcta"),
  moneyAmountRule("amount", "El monto debe ser mayor a 0", { onlyIf: presentIn("amount") }),
  moneyDateRule("spent_at", "La fecha del gasto no es válida", { onlyIf: presentIn("spent_at") }),
  body("description")
    .optional()
    .isString()
    .withMessage("La descripción no es válida")
    .bail()
    .trim()
    .isLength({ min: 1, max: 300 })
    .withMessage("La descripción es obligatoria (máximo 300 caracteres)"),
  // Texto libre (como al crear); null = sin categoría.
  body("category").optional({ values: "null" }).isString().isLength({ max: 50 }).withMessage("Máximo 50 caracteres"),
  // null = efectivo. Que sea de la empresa y esté activa lo valida el service.
  body("payment_account_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cuenta seleccionada no es válida"),
  correctionReasonRule(),
];

// GET /quotation/expense/:id/corrections?page=&limit=
export { correctionHistoryValidator as quotationExpenseCorrectionsValidator };
