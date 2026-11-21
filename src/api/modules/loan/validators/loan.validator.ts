import { body, param, query } from "express-validator";
import { moneyAmountRule, moneyDateRule } from "../../../../core/validators/money.validator";
import { LOAN_STATUS_FILTERS } from "../types/loan.types";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
// Interés en % (0 = sin interés). Un tope alto pero finito: evita un número
// absurdo por un error de tipeo.
const MAX_INTEREST_RATE = 1000;

const idParam = (name: string, message: string) => param(name).isInt({ gt: 0 }).withMessage(message).toInt();
const optionalText = (field: string, max: number) =>
  body(field).optional({ values: "null" }).isString().withMessage("Debe ser texto").bail().trim().isLength({ max }).withMessage(`Máximo ${max} caracteres`);
const optionalDate = (field: string) =>
  body(field).optional({ values: "falsy" }).matches(DATE_ONLY).withMessage("La fecha no es válida (formato AAAA-MM-DD)");
const interestRateRule = (optional: boolean) => {
  const chain = optional ? body("interest_rate").optional() : body("interest_rate");
  return chain
    .isFloat({ min: 0, max: MAX_INTEREST_RATE })
    .withMessage(`El interés debe ser un porcentaje entre 0 y ${MAX_INTEREST_RATE}`)
    .toFloat();
};

export const listLoansValidator = [
  query("status").optional({ values: "falsy" }).isIn(LOAN_STATUS_FILTERS).withMessage("Estado inválido"),
  query("search").optional({ values: "falsy" }).isString().isLength({ max: 100 }).withMessage("Máximo 100 caracteres"),
  query("dateFrom").optional({ values: "falsy" }).matches(DATE_ONLY).withMessage("Fecha inválida"),
  query("dateTo").optional({ values: "falsy" }).matches(DATE_ONLY).withMessage("Fecha inválida"),
  query("companyId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("Empresa inválida"),
];

export const loanIdValidator = [idParam("id", "El préstamo no es válido")];

export const createLoanValidator = [
  body("company_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La empresa no es válida"),
  body("business_unit_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La tienda no es válida"),
  body("borrower_name")
    .isString()
    .withMessage("Escribe a quién se le prestó")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Escribe a quién se le prestó")
    .isLength({ max: 150 })
    .withMessage("Máximo 150 caracteres"),
  optionalText("borrower_document", 20),
  optionalText("borrower_phone", 20),
  moneyAmountRule("principal", "El monto prestado debe ser mayor a 0"),
  interestRateRule(false),
  moneyDateRule("loaned_at", "La fecha del préstamo es obligatoria"),
  optionalDate("due_date"),
  body("payment_account_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cuenta no es válida"),
  optionalText("operation_number", 50),
  optionalText("notes", 500),
];

export const updateLoanValidator = [
  idParam("id", "El préstamo no es válido"),
  body("borrower_name")
    .optional()
    .isString()
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Escribe a quién se le prestó")
    .isLength({ max: 150 })
    .withMessage("Máximo 150 caracteres"),
  optionalText("borrower_document", 20),
  optionalText("borrower_phone", 20),
  body("principal").optional().isFloat({ gt: 0 }).withMessage("El monto prestado debe ser mayor a 0").toFloat(),
  interestRateRule(true),
  body("loaned_at").optional().custom((value: unknown) => typeof value === "string" && DATE_ONLY.test(value)).withMessage("La fecha no es válida"),
  body("due_date").optional({ values: "null" }).matches(DATE_ONLY).withMessage("La fecha no es válida (formato AAAA-MM-DD)"),
  body("payment_account_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cuenta no es válida"),
  optionalText("operation_number", 50),
  optionalText("notes", 500),
];

export const createLoanPaymentValidator = [
  idParam("id", "El préstamo no es válido"),
  moneyAmountRule("amount", "El monto cobrado debe ser mayor a 0"),
  moneyDateRule("paid_at", "La fecha del cobro es obligatoria"),
  body("payment_account_id").optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La cuenta no es válida"),
  optionalText("operation_number", 50),
  optionalText("notes", 500),
];

export const loanPaymentIdValidator = [idParam("paymentId", "El cobro no es válido")];
