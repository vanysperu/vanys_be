import { body, param, query } from "express-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import { moneyAmountRule, moneyDateRule } from "../../../../core/validators/money.validator";
import { operationNumberRule } from "../../money_correction/validators/money_correction.validator";

// Solo la FORMA de cada campo. Que las cuentas sean de la empresa y estén
// activas, y que la tienda sea de la empresa, lo validan controller/service
// contra la sesión (un id ajeno nunca se confirma desde acá).
const accountRule = (field: string) =>
  body(field).optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cuenta seleccionada no es válida");

const descriptionRule = () =>
  body("description").optional({ values: "null" }).isString().isLength({ max: 500 }).withMessage("Máximo 500 caracteres");

const transferIdRule = () =>
  param("id").isInt({ gt: 0 }).withMessage("El id de la transferencia debe ser un número entero positivo");

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export const createCashTransferValidator = [
  // null / ausente = Efectivo.
  accountRule("from_payment_account_id"),
  accountRule("to_payment_account_id"),
  moneyAmountRule("amount"),
  // Día calendario de Lima, nunca futuro (mismas reglas que todo el dinero).
  moneyDateRule("occurred_at", "La fecha es obligatoria"),
  descriptionRule(),
  operationNumberRule(),
  // Solo los usa quien puede elegir (Super Administrador / admin sin tienda);
  // al resto el controller le fuerza su empresa y su tienda.
  body("company_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La empresa debe ser un id válido"),
  body("business_unit_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La tienda debe ser un id válido"),
];

// Cada campo es opcional (ausente = se queda como está) y pasa por las MISMAS
// reglas que al crear. El motivo es obligatorio: queda en el log.
const presentIn = (field: string) => body(field).exists();

export const updateCashTransferValidator = [
  transferIdRule(),
  moneyAmountRule("amount", "El monto debe ser mayor a 0", { onlyIf: presentIn("amount") }),
  moneyDateRule("occurred_at", "La fecha no es válida", { onlyIf: presentIn("occurred_at") }),
  accountRule("from_payment_account_id"),
  accountRule("to_payment_account_id"),
  descriptionRule(),
  operationNumberRule(),
  body("reason")
    .isString()
    .withMessage("Indica el motivo de la corrección")
    .bail()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("El motivo de la corrección debe tener entre 5 y 500 caracteres"),
];

export const disableCashTransferValidator = [transferIdRule()];

export const listCashTransfersValidator = [
  ...paginationValidator,
  query("dateFrom").optional({ values: "falsy" }).matches(DATE_ONLY).withMessage("La fecha desde debe ser AAAA-MM-DD"),
  query("dateTo").optional({ values: "falsy" }).matches(DATE_ONLY).withMessage("La fecha hasta debe ser AAAA-MM-DD"),
  query("orderDir").optional().isIn(["asc", "desc"]).withMessage("El orden debe ser 'asc' o 'desc'"),
  query("companyId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("Empresa inválida"),
];
