import { body, param } from "express-validator";
import { DataBase } from "../../../../database";

// "1,2,3,4,5" — días ISO (1=lunes..7=domingo) separados por coma, sin
// espacios ni duplicados de formato raro.
const WORKING_DAYS_REGEX = /^[1-7](,[1-7]){0,6}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
// Código de tienda: alfanumérico + guion/guion bajo (es un código, no un
// nombre propio) — evita símbolos raros que después rompen URLs/reportes.
const BUSINESS_CODE_REGEX = /^[A-Za-z0-9_-]+$/;
// Color hexadecimal de 6 dígitos ("#RRGGBB") — columna STRING(7) en DB.
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

const businessHoursValidators = (optionalValues: { values: "null" | "falsy" }) => [
  body("working_days")
    .optional(optionalValues)
    .matches(WORKING_DAYS_REGEX)
    .withMessage("Los días laborales deben ser números del 1 (lunes) al 7 (domingo), separados por coma"),
  body("opens_at").optional(optionalValues).matches(TIME_REGEX).withMessage("La hora de apertura debe tener formato HH:mm"),
  body("closes_at").optional(optionalValues).matches(TIME_REGEX).withMessage("La hora de cierre debe tener formato HH:mm"),
  // "HH:mm" compara bien como string (zero-padded, 24h) — pedido explícito
  // del usuario: "validaciones de que la hora de apertura sea menor a la
  // de cierre".
  body("closes_at").custom((value: string | undefined, { req }) => {
    const opensAt = req.body.opens_at as string | undefined;
    if (!opensAt || !value) return true;
    if (opensAt >= value) throw new Error("La hora de apertura debe ser menor que la hora de cierre");
    return true;
  }),
];

export const createBusinessUnitValidator = [
  body("business_code")
    .not()
    .isEmpty()
    .withMessage("El código de tienda es obligatorio")
    .bail()
    .isString()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres")
    .bail()
    .matches(BUSINESS_CODE_REGEX)
    .withMessage("El código de tienda solo puede tener letras, números, guiones y guion bajo"),
  body("company_id")
    .not()
    .isEmpty()
    .withMessage("La empresa es obligatoria")
    .bail()
    .isInt({ gt: 0 })
    .withMessage("La empresa debe ser un id válido")
    .bail()
    .custom(async (value: number) => {
      const company = await DataBase.instance.company.findOne({ where: { id: Number(value) } });
      if (!company) throw new Error("La empresa con el ID proporcionado no existe.");
      return true;
    }),
  body("primary_color").optional().isString().matches(HEX_COLOR_REGEX).withMessage("El color debe ser hexadecimal (#RRGGBB)"),
  body("secondary_color").optional().isString().matches(HEX_COLOR_REGEX).withMessage("El color debe ser hexadecimal (#RRGGBB)"),
  body("address")
    .optional({ values: "null" })
    .isString()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  ...businessHoursValidators({ values: "null" }),
];

const paramBusinessUnitIdValidator = param("id")
  .not()
  .isEmpty()
  .withMessage("El id de la tienda es obligatorio")
  .bail()
  .isInt({ gt: 0 })
  .withMessage("El id de la tienda debe ser un número entero positivo")
  .bail()
  .custom(async (value: string) => {
    const businessUnit = await DataBase.instance.business_unit.findOne({ where: { id: Number(value) } });
    if (!businessUnit) throw new Error("La tienda con el ID proporcionado no existe.");
    return true;
  })
  .bail();

export const updateBusinessUnitValidator = [
  paramBusinessUnitIdValidator,
  body("business_code")
    .optional()
    .isString()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres")
    .bail()
    .matches(BUSINESS_CODE_REGEX)
    .withMessage("El código de tienda solo puede tener letras, números, guiones y guion bajo"),
  body("primary_color").optional().isString().matches(HEX_COLOR_REGEX).withMessage("El color debe ser hexadecimal (#RRGGBB)"),
  body("secondary_color").optional().isString().matches(HEX_COLOR_REGEX).withMessage("El color debe ser hexadecimal (#RRGGBB)"),
  body("address")
    .optional({ values: "null" })
    .isString()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  ...businessHoursValidators({ values: "null" }),
];

export const disableBusinessUnitValidator = [paramBusinessUnitIdValidator];
