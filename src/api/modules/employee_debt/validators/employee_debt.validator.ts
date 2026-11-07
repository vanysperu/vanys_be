import { body, param, query } from "express-validator";
import { moneyAmountRule, moneyDateRule } from "../../../../core/validators/money.validator";
import {
  correctionHistoryValidator,
  correctionIdParamRule,
  correctionReasonRule,
  operationNumberRule,
} from "../../money_correction/validators/money_correction.validator";
import { optionalAdjustmentReasonRule } from "../../cash_movement/validators/adjustment_reason.validator";

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
  operationNumberRule(),
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
  // Motivo opcional: obligatorio solo si la reposición es de un mes cerrado
  // (la anulación se registra como ajuste, cierre de caja).
  optionalAdjustmentReasonRule(),
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

// --- Correcciones -------------------------------------------------------

// Cada campo es opcional: ausente = se queda como está. Si viene, pasa por
// las MISMAS reglas que al crear (monto y fecha de money.validator).
const presentIn = (field: string) => body(field).exists();

// PUT /employee-debt/update/:id — deuda MANUAL. Que la deuda sea manual, no
// esté anulada, el trabajador/tienda/categoría nuevos y el alcance los
// valida el service con la fila bloqueada.
export const correctManualEmployeeDebtValidator = [
  correctionIdParamRule("id"),
  body("origin").not().exists().withMessage("El origen de una deuda no se corrige"),
  body("company_id").not().exists().withMessage("La empresa de una deuda no se corrige"),
  moneyAmountRule("amount", "El monto debe ser mayor a 0", { onlyIf: presentIn("amount") }),
  moneyDateRule("incurred_at", "Indica la fecha en que se pagó", { onlyIf: presentIn("incurred_at") }),
  body("description")
    .optional()
    .isString()
    .withMessage("Describe qué se pagó")
    .bail()
    .trim()
    .isLength({ min: 3, max: 300 })
    .withMessage("La descripción debe tener entre 3 y 300 caracteres"),
  body("category")
    .optional()
    .isString()
    .withMessage("Selecciona la categoría del gasto")
    .bail()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("Selecciona la categoría del gasto (máximo 50 caracteres)"),
  body("business_unit_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La tienda debe ser un id válido"),
  body("user_id").optional().isInt({ gt: 0 }).withMessage("El trabajador debe ser un id válido"),
  correctionReasonRule(),
];

// PUT /employee-debt/payment/update/:id — reposición: monto, fecha y cuenta.
// El trabajador no se corrige (se anula y se registra la correcta).
export const correctEmployeeDebtPaymentValidator = [
  correctionIdParamRule("id"),
  body("user_id")
    .not()
    .exists()
    .withMessage("El trabajador de una reposición no se corrige: anúlala y registra una nueva"),
  moneyAmountRule("amount", "El monto a reponer debe ser mayor a 0", { onlyIf: presentIn("amount") }),
  moneyDateRule("paid_at", "Indica la fecha en que se le repuso", { onlyIf: presentIn("paid_at") }),
  body("payment_account_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cuenta seleccionada no es válida"),
  operationNumberRule(),
  correctionReasonRule(),
];

export const findEmployeeDebtValidator = [correctionIdParamRule("id")];
export const employeeDebtCorrectionsValidator = correctionHistoryValidator;
