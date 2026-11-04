import { body } from "express-validator";
import { HEX_COLOR_REGEX, MAX_PRODUCT_COLORS } from "../services/shared/colors";
import { MAX_PRODUCT_CODES } from "../services/shared/codes";

// Reglas de categoría, subcategoría, colores y foto de un producto. `prefix`
// permite usarlas en el body plano ("") o dentro de una lista
// ("products.*.") de la subida masiva.
export const productCatalogRules = (prefix = "") => [
  body(`${prefix}category_id`).optional({ values: "null" }).isInt({ gt: 0 }).withMessage("La categoría debe ser un id válido").toInt(),
  body(`${prefix}subcategory_id`)
    .optional({ values: "null" })
    .isInt({ gt: 0 })
    .withMessage("La subcategoría debe ser un id válido")
    .toInt(),
  body(`${prefix}colors`)
    .optional()
    .isArray({ max: MAX_PRODUCT_COLORS })
    .withMessage(`Los colores son una lista de hasta ${MAX_PRODUCT_COLORS}`),
  body(`${prefix}colors.*.name`)
    .isString()
    .withMessage("Cada color necesita un nombre")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Cada color necesita un nombre")
    .isLength({ max: 60 })
    .withMessage("El nombre del color tiene máximo 60 caracteres"),
  body(`${prefix}colors.*.hex`)
    .optional({ values: "falsy" })
    .matches(HEX_COLOR_REGEX)
    .withMessage("El color debe ser un código hex como #1F5FC0"),
  // Códigos de proveedores: el SKU sigue siendo uno solo; estos son extra.
  body(`${prefix}codes`)
    .optional()
    .isArray({ max: MAX_PRODUCT_CODES })
    .withMessage(`Los códigos son una lista de hasta ${MAX_PRODUCT_CODES}`),
  body(`${prefix}codes.*.code`)
    .isString()
    .withMessage("Cada código necesita su valor")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Cada código necesita su valor")
    .isLength({ max: 60 })
    .withMessage("El código tiene máximo 60 caracteres"),
  body(`${prefix}codes.*.supplier`)
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max: 150 })
    .withMessage("El proveedor tiene máximo 150 caracteres"),
  body(`${prefix}codes.*.color`)
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max: 60 })
    .withMessage("El color del código tiene máximo 60 caracteres"),
  body(`${prefix}image_path`)
    .optional({ values: "null" })
    .isString()
    .isLength({ max: 255 })
    .withMessage("La ruta de la foto no es válida"),
];
