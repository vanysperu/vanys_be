import { body, CustomValidator } from "express-validator";
import { assertDocumentNumberMatchesType, DOCUMENT_TYPE_RULES } from "../../../../core/validators/documentType.validator";
import { normalizePeruvianPhone } from "../services/shared/phone";

// Mismas reglas de datos que el módulo de clientes (client.validator.ts):
// lo que entra por la web termina siendo un cliente más del sistema.
const NAME_REGEX = /^[A-Za-zÀ-ÖØ-öø-ÿ\s'.-]+$/;
const PHONE_REGEX = /^\d{6,9}$/;

// Tope de items por pedido: un carrito real de la web no llega a esto, y
// evita que un solo request arme una cotización gigante.
export const WEB_QUOTE_MAX_ITEMS = 50;
const MAX_QUANTITY = 1_000_000;

const isFilled = (value: unknown) => value !== undefined && value !== null && value !== "";

// Tipo y número de documento van juntos (o ninguno), como en clientes.
const assertDocumentTypeAndNumberTogether: CustomValidator = (value, { req }) => {
  const documentNumber: unknown = req.body?.client?.document_number;
  if (!isFilled(value) && !isFilled(documentNumber)) return true;
  if (isFilled(value) !== isFilled(documentNumber)) throw new Error("Indica el tipo y el número de documento juntos.");

  const documentType = Number(value);
  if (!DOCUMENT_TYPE_RULES[documentType]) throw new Error("El tipo de documento no es válido.");
  assertDocumentNumberMatchesType(documentType, String(documentNumber));
  return true;
};

export const createWebQuoteRequestValidator = [
  body("client").isObject().withMessage("Los datos del cliente son obligatorios"),
  // Se acepta con espacios, guiones o el prefijo +51 (como lo escribe un
  // cliente en un formulario); se guarda solo con dígitos, igual que en
  // clientes.
  body("client.phone")
    .isString()
    .withMessage("El celular del cliente es obligatorio")
    .bail()
    .customSanitizer((value: string) => normalizePeruvianPhone(value))
    .matches(PHONE_REGEX)
    .withMessage("El celular debe tener entre 6 y 9 dígitos"),
  body("client.name")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max: 255 })
    .withMessage("Máximo 255 caracteres")
    .bail()
    .matches(NAME_REGEX)
    .withMessage("El nombre solo puede tener letras"),
  body("client.email").optional({ values: "falsy" }).isEmail().withMessage("El email debe ser válido").isLength({ max: 150 }),
  body("client.document_type")
    .optional({ values: "falsy" })
    .isInt()
    .withMessage("El tipo de documento no es válido")
    .bail()
    .custom(assertDocumentTypeAndNumberTogether),
  body("client.document_number")
    .optional({ values: "falsy" })
    .isString()
    .isLength({ max: 20 })
    .withMessage("Máximo 20 caracteres"),
  body("client.address").optional({ values: "falsy" }).isString().isLength({ max: 255 }).withMessage("Máximo 255 caracteres"),
  body("items")
    .isArray({ min: 1, max: WEB_QUOTE_MAX_ITEMS })
    .withMessage(`El pedido debe tener entre 1 y ${WEB_QUOTE_MAX_ITEMS} productos`),
  body("items.*.sku")
    .isString()
    .withMessage("Cada producto necesita su SKU")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Cada producto necesita su SKU")
    .isLength({ max: 50 })
    .withMessage("El SKU tiene máximo 50 caracteres"),
  body("items.*.quantity")
    .isInt({ min: 1, max: MAX_QUANTITY })
    .withMessage(`La cantidad debe ser un número entero entre 1 y ${MAX_QUANTITY}`)
    .toInt(),
];
