import { body, query } from "express-validator";
import { productCatalogRules } from "../../product/validators/product_catalog.rules";

// Mismo formato de SKU que la pantalla de productos (product.validator.ts).
const SKU_REGEX = /^[A-Za-z0-9_-]+$/;
// Tope de productos por envío: un catálogo grande se manda en varias tandas.
export const BULK_MAX_PRODUCTS = 200;

const priceRule = (field: string, label: string) =>
  body(`products.*.${field}`)
    .optional({ values: "null" })
    .isFloat({ min: 0, max: 99999999.99 })
    .withMessage(`El precio ${label} debe ser un número positivo`)
    .toFloat();

export const bulkProductsValidator = [
  body("replicate").optional().isBoolean().withMessage("replicate debe ser true o false").toBoolean(),
  // Con replicate=true las empresas extra son obligatorias.
  body("company_ids")
    .if(body("replicate").custom((value) => value === true || value === "true"))
    .isArray({ min: 1, max: 50 })
    .withMessage("Con replicate=true indica en company_ids las empresas extra (lista de ids)"),
  body("company_ids.*").optional().isInt({ gt: 0 }).withMessage("Cada empresa debe ser un id válido").toInt(),
  body("products")
    .isArray({ min: 1, max: BULK_MAX_PRODUCTS })
    .withMessage(`Envía entre 1 y ${BULK_MAX_PRODUCTS} productos por pedido`),
  body("products.*.sku")
    .isString()
    .withMessage("Cada producto necesita su SKU")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Cada producto necesita su SKU")
    .isLength({ max: 50 })
    .withMessage("El SKU tiene máximo 50 caracteres")
    .matches(SKU_REGEX)
    .withMessage("El SKU solo puede tener letras, números, guiones y guion bajo"),
  // Obligatorio al crear; al actualizar se conserva si no llega (lo valida
  // el service por producto).
  body("products.*.name").optional().isString().trim().isLength({ min: 1, max: 255 }).withMessage("El nombre tiene de 1 a 255 caracteres"),
  body("products.*.description").optional({ values: "null" }).isString().isLength({ max: 2000 }),
  priceRule("price_unit", "por unidad"),
  priceRule("price_hundred", "por ciento"),
  priceRule("price_half_thousand", "por medio millar"),
  priceRule("price_thousand", "por millar"),
  body("products.*.requires_customization").optional().isBoolean().withMessage("requires_customization debe ser true o false"),
  ...productCatalogRules("products.*."),
];

export const listPublicProductsValidator = [
  query("search").optional({ values: "falsy" }).isString().isLength({ max: 100 }),
  query("sku").optional({ values: "falsy" }).isString().isLength({ max: 50 }),
  query("category_id").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("category_id debe ser un id válido"),
  query("subcategory_id").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("subcategory_id debe ser un id válido"),
  query("color").optional({ values: "falsy" }).isString().isLength({ max: 60 }),
  query("code").optional({ values: "falsy" }).isString().isLength({ max: 60 }),
  query("orderBy").optional({ values: "falsy" }).isIn(["name", "sku", "price_unit", "created_at"]).withMessage("orderBy no válido"),
];

export const listPublicCategoriesValidator = [
  query("search").optional({ values: "falsy" }).isString().isLength({ max: 100 }),
];
