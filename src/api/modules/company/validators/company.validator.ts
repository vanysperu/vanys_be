import { body, param } from "express-validator";
import { DataBase } from "../../../../database";

// RUC peruano: exactamente 11 dígitos numéricos, sin letras ni espacios.
const RUC_REGEX = /^\d{11}$/;
// Teléfono de empresa: solo dígitos, mismo rango razonable que el resto del
// sistema (users/clients ya usan un criterio similar de solo-dígitos).
const PHONE_REGEX = /^\d{6,15}$/;

const themeColorValidator = body("theme_color")
  .optional()
  .isString()
  .bail()
  .custom(async (value: string) => {
    const theme = await DataBase.instance.theme.findOne({ where: { code: value, active: true } });
    if (!theme) throw new Error("theme_color debe ser el código de una paleta activa (ver GET /theme/list)");
    return true;
  })
  .bail();

export const createCompanyValidator = [
  body("ruc")
    .not()
    .isEmpty()
    .withMessage("El RUC es obligatorio")
    .bail()
    .isString()
    .matches(RUC_REGEX)
    .withMessage("El RUC debe tener exactamente 11 dígitos numéricos"),
  body("business_name")
    .not()
    .isEmpty()
    .withMessage("La razón social es obligatoria")
    .bail()
    .isString()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres"),
  body("description").optional({ values: "null" }).isString(),
  body("address").optional({ values: "null" }).isString().isLength({ max: 255 }).withMessage("Máximo 255 caracteres"),
  body("phone")
    .optional({ values: "null" })
    .isString()
    .matches(PHONE_REGEX)
    .withMessage("El teléfono debe tener entre 6 y 15 dígitos, solo números"),
  body("email")
    .optional({ values: "null" })
    .isEmail()
    .withMessage("El email debe ser válido")
    .bail()
    .isLength({ max: 150 })
    .withMessage("Máximo 150 caracteres"),
  themeColorValidator,
];

// Campos que un admin de empresa puede tocar de SU propia empresa para el
// PDF de cotización — sin theme_color (eso sigue siendo exclusivo de
// is_system, ver seed de RBAC de Apariencia de empresas) ni ruc (cambiar el
// RUC de una empresa ya existente es una decisión más delicada, se deja
// para is_system vía /company/update/:id si hiciera falta).
export const updateMyCompanyDocumentSettingsValidator = [
  body("business_name").optional().isString().isLength({ max: 255 }).withMessage("Máximo 255 caracteres"),
  body("address").optional({ values: "falsy" }).isString().isLength({ max: 255 }).withMessage("Máximo 255 caracteres"),
  // {values:"null"} solo exceptúa `null` literal, no un string vacío — el
  // formulario manda "" cuando el campo queda en blanco, y eso llegaba
  // hasta el regex de teléfono y lo rechazaba (mismo patrón de bug ya
  // corregido en user/client; acá nunca se había tocado).
  body("phone")
    .optional({ values: "falsy" })
    .isString()
    .matches(PHONE_REGEX)
    .withMessage("El teléfono debe tener entre 6 y 15 dígitos, solo números"),
  body("logo_url").optional({ values: "null" }).isString().isLength({ max: 500 }).withMessage("Máximo 500 caracteres"),
  body("legal_terms_caption")
    .optional({ values: "null" })
    .isString()
    .isLength({ max: 4000 })
    .withMessage("Máximo 4000 caracteres"),
];

const paramCompanyIdValidator = param("id")
  .not()
  .isEmpty()
  .withMessage("El id de la empresa es obligatorio")
  .bail()
  .isInt({ gt: 0 })
  .withMessage("El id de la empresa debe ser un número entero positivo")
  .bail()
  .custom(async (value: string) => {
    const company = await DataBase.instance.company.findOne({ where: { id: Number(value) } });
    if (!company) throw new Error("La empresa con el ID proporcionado no existe.");
    return true;
  })
  .bail();

export const updateCompanyValidator = [paramCompanyIdValidator, themeColorValidator];

export const disableCompanyValidator = [paramCompanyIdValidator];
