import { body, param } from "express-validator";

const quotationIdParam = param("id").isInt({ min: 1 }).withMessage("El id de la cotización no es válido").toInt();

// Código del enlace público: 22 caracteres base64url.
const publicCodeParam = param("code")
  .matches(/^[A-Za-z0-9_-]{22}$/)
  .withMessage("Esta cotización ya no está disponible");

export const quotationShareIdValidator = [quotationIdParam];

export const setPublicLinkEnabledValidator = [
  quotationIdParam,
  body("enabled").isBoolean().withMessage("Indica si el enlace queda encendido (true) o apagado (false)").toBoolean(),
];

export const logWhatsappShareValidator = [
  quotationIdParam,
  body("phone").optional({ values: "null" }).isString().isLength({ max: 30 }).withMessage("El número no es válido"),
];

export const sendQuotationEmailValidator = [
  quotationIdParam,
  body("to").isEmail().withMessage("El correo del destinatario no es válido").isLength({ max: 255 }),
  body("cc")
    .optional({ values: "falsy" })
    .isEmail()
    .withMessage("El correo en copia no es válido")
    .isLength({ max: 255 }),
  body("subject")
    .isString()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage("El asunto debe tener entre 3 y 200 caracteres"),
  body("message")
    .isString()
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage("El mensaje es obligatorio (máximo 2000 caracteres)"),
  body("attachPdf").isBoolean().withMessage("Indica si se adjunta el PDF").toBoolean(),
];

export const publicQuotationValidator = [publicCodeParam];
