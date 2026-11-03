import { body, param, query } from "express-validator";
import { PERIOD_PATTERN } from "../../../../utils/dateUtils";

// Solo FORMA de los datos: las reglas del cierre (orden de los meses, mes
// terminado, motivo de reapertura con su código INVALID_REASON, etc.) las
// resuelve el service con el libro bloqueado.

// Tope de DECIMAL(14, 2) (saldo inicial; puede ser negativo).
const MAX_OPENING_AMOUNT = 999999999999.99;
const MAX_OPENING_ACCOUNTS = 100;

const periodParamRule = param("period")
  .matches(PERIOD_PATTERN)
  .withMessage("El mes debe tener el formato AAAA-MM");

const companyIdQueryRule = query("companyId")
  .optional({ values: "falsy" })
  .isInt({ gt: 0 })
  .withMessage("La empresa no es válida");

const companyIdBodyRule = body("company_id")
  .optional({ values: "null" })
  .isInt({ gt: 0 })
  .withMessage("La empresa no es válida");

const notesRule = body("notes")
  .optional({ values: "null" })
  .isString()
  .withMessage("La nota debe ser texto")
  .bail()
  .isLength({ max: 500 })
  .withMessage("Máximo 500 caracteres");

const hasAtMostTwoDecimals = (value: unknown): boolean => /^-?\d+(\.\d{1,2})?$/.test(String(value).trim());

export const cashClosingCompanyValidator = [companyIdQueryRule];

export const cashClosingPeriodValidator = [periodParamRule, companyIdQueryRule];

export const cashClosingAdjustmentsValidator = [
  periodParamRule,
  companyIdQueryRule,
  query("type")
    .optional({ values: "falsy" })
    .isIn(["posted", "affecting"])
    .withMessage("El tipo debe ser 'posted' o 'affecting'"),
];

export const cashOpeningFindValidator = [
  companyIdQueryRule,
  query("startPeriod")
    .optional({ values: "falsy" })
    .matches(PERIOD_PATTERN)
    .withMessage("El mes de inicio debe tener el formato AAAA-MM"),
];

export const cashOpeningSetValidator = [
  companyIdBodyRule,
  body("start_period").matches(PERIOD_PATTERN).withMessage("El mes de inicio debe tener el formato AAAA-MM"),
  body("openings")
    .isArray({ min: 1, max: MAX_OPENING_ACCOUNTS })
    .withMessage("Indica el saldo inicial de al menos una cuenta")
    .bail()
    .custom((openings: unknown[]) => {
      // Una cuenta (o Efectivo) una sola vez.
      const keys = openings.map((row) => {
        const accountId = (row as { payment_account_id?: unknown } | null)?.payment_account_id;
        return accountId === null || accountId === undefined ? "cash" : String(accountId);
      });
      if (new Set(keys).size !== keys.length) throw new Error("Cada cuenta puede aparecer una sola vez");
      return true;
    }),
  body("openings.*.payment_account_id")
    .optional({ values: "null" })
    .isInt({ gt: 0 })
    .withMessage("La cuenta seleccionada no es válida"),
  body("openings.*.amount")
    .isFloat({ min: -MAX_OPENING_AMOUNT, max: MAX_OPENING_AMOUNT })
    .withMessage("El saldo inicial debe ser un número")
    .bail()
    .custom((value: unknown) => {
      if (!hasAtMostTwoDecimals(value)) throw new Error("El monto admite como máximo 2 decimales");
      return true;
    }),
  notesRule,
];

export const cashCloseValidator = [periodParamRule, companyIdBodyRule, notesRule];

export const cashReopenValidator = [
  periodParamRule,
  companyIdBodyRule,
  // Largo 5–500: lo valida el service (400 INVALID_REASON).
  body("reason").optional({ values: "null" }).isString().withMessage("El motivo debe ser texto"),
];
