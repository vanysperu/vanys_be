import { body, param, query } from "express-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import { correctionIdParamRule, operationNumberRule } from "../../money_correction/validators/money_correction.validator";
import { MONEY_CORRECTION_SOURCES } from "../../money_correction/types/money_correction.types";
import { moneyAmountRule, moneyDateRule } from "../../../../core/validators/money.validator";
import { optionalAdjustmentReasonRule } from "./adjustment_reason.validator";

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
  operationNumberRule(),
];

// Solo la FORMA del id: la existencia y el alcance (empresa/tienda) los
// resuelve el service con la fila bloqueada, y un id ajeno responde 404 igual
// que uno que no existe (el validator de arriba confirmaba que un id de otra
// empresa existe).
const paramCashMovementIdShape = param("id")
  .isInt({ gt: 0 })
  .withMessage("El id del movimiento debe ser un número entero positivo");

// Motivo opcional: obligatorio solo si el movimiento es de un mes cerrado
// (ajuste); eso lo decide el service con la fila bloqueada.
export const disableCashMovementValidator = [paramCashMovementIdShape, optionalAdjustmentReasonRule()];

// Cada campo es opcional: ausente = se queda como está. Si viene, pasa por
// las MISMAS reglas que al crear (monto y fecha de money.validator).
const presentIn = (field: string) => body(field).exists();

export const updateCashMovementValidator = [
  paramCashMovementIdShape,
  // Un ingreso que en realidad era un egreso es OTRO movimiento: se anula y
  // se registra el correcto (ver README). Se rechaza explícito para que no
  // parezca que se guardó.
  body("direction")
    .not()
    .exists()
    .withMessage("El tipo (ingreso/egreso) no se corrige: anula este movimiento y registra uno nuevo"),
  moneyAmountRule("amount", "El monto debe ser mayor a 0", { onlyIf: presentIn("amount") }),
  moneyDateRule("occurred_at", "La fecha no es válida", { onlyIf: presentIn("occurred_at") }),
  body("category")
    .optional()
    .isString()
    .withMessage("La categoría no es válida")
    .bail()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("La categoría es obligatoria (máximo 50 caracteres)"),
  operationNumberRule(),
  body("description").optional({ values: "null" }).isString().isLength({ max: 500 }).withMessage("Máximo 500 caracteres"),
  body("payment_account_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cuenta seleccionada no es válida"),
  body("quotation_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cotización debe ser un id válido"),
  body("purchase_order_id")
    .optional({ values: "null" })
    .isInt({ gt: 0 })
    .withMessage("La orden de compra debe ser un id válido"),
  // Obligatorio: una corrección de caja sin explicación no se puede auditar.
  body("reason")
    .isString()
    .withMessage("Indica el motivo de la corrección")
    .bail()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("El motivo de la corrección debe tener entre 5 y 500 caracteres"),
];

// GET /cash-movement/:sourceId/corrections?source=<fuente>&page=&limit=
// `source` es una de las 5 fuentes de Caja (por defecto, manual).
export const listCashMovementCorrectionsValidator = [
  correctionIdParamRule("sourceId"),
  query("source")
    .optional()
    .isIn([...MONEY_CORRECTION_SOURCES])
    .withMessage("La fuente del movimiento no es válida"),
  ...paginationValidator,
];

// Resumen del mes (?period=YYYY-MM, opcional: por defecto el mes en curso).
export const monthSummaryValidator = [
  query("period")
    .optional({ values: "falsy" })
    .matches(/^\d{4}-(0[1-9]|1[0-2])$/)
    .withMessage("El mes debe tener el formato YYYY-MM"),
  query("companyId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("Empresa inválida"),
];
