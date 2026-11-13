import { body, param, query } from "express-validator";
import { SOURCE_TYPES } from "../model/supplier_stock.models";

const idParam = param("id").isInt({ min: 1 }).withMessage("La fuente no es válida").toInt();

// En un multipart (archivo subido) el mapeo llega como texto JSON.
const parseJsonObject = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const columnName = (field: string, label: string, required: boolean) => {
  const chain = body(`column_map.${field}`);
  return (required ? chain : chain.optional({ values: "falsy" }))
    .isString()
    .trim()
    .isLength({ min: 1, max: 60 })
    .withMessage(`Indica la columna de ${label} (su encabezado o su letra)`);
};

const columnMapRules = (required: boolean) => [
  (required ? body("column_map") : body("column_map").optional({ values: "falsy" }))
    .customSanitizer(parseJsonObject)
    .isObject()
    .withMessage("Indica qué columna es cada dato"),
  ...(required
    ? [columnName("code", "código", true), columnName("quantity", "stock", true)]
    : [columnName("code", "código", false), columnName("quantity", "stock", false)]),
  columnName("color", "color", false),
  columnName("description", "descripción", false),
  columnName("price", "precio", false),
];

const sheetRules = [
  body("sheet_name").optional({ values: "falsy" }).isString().trim().isLength({ max: 100 }).withMessage("La hoja tiene máximo 100 caracteres"),
  body("header_row").isInt({ min: 1, max: 50 }).withMessage("La fila de encabezado va de 1 a 50").toInt(),
];

const sourceBody = [
  body("supplier_id").isInt({ min: 1 }).withMessage("Elige el proveedor").toInt(),
  body("name").isString().trim().isLength({ min: 1, max: 120 }).withMessage("El nombre es obligatorio (máximo 120 caracteres)"),
  body("source_type").isIn(SOURCE_TYPES).withMessage("Elige si es un enlace o un archivo que se sube"),
  body("url").optional({ values: "falsy" }).isString().trim().isLength({ max: 2000 }).withMessage("El enlace es demasiado largo"),
  body("refresh_minutes").isInt({ min: 30, max: 10080 }).withMessage("La frecuencia va de 30 minutos a 7 días").toInt(),
  ...sheetRules,
  ...columnMapRules(true),
];

export const createSourceValidator = [
  body("company_id").optional({ values: "null" }).isInt({ min: 1 }).withMessage("La empresa no es válida"),
  ...sourceBody,
];
export const updateSourceValidator = [idParam, ...sourceBody];
export const sourceIdValidator = [idParam];

export const previewValidator = [
  body("url").optional({ values: "falsy" }).isString().trim().isLength({ max: 2000 }),
  body("sourceId").optional({ values: "falsy" }).isInt({ min: 1 }).toInt(),
  ...sheetRules,
  ...columnMapRules(false),
];

export const listSourcesValidator = [
  query("status").optional().isIn(["active", "inactive", "active,inactive", "inactive,active"]),
  query("companyId").optional({ values: "falsy" }).isInt({ min: 1 }),
];

export const lookupValidator = [
  query("productIds")
    .isString()
    .matches(/^\d+(,\d+){0,99}$/)
    .withMessage("Indica hasta 100 productos separados por coma"),
  query("companyId").optional({ values: "falsy" }).isInt({ min: 1 }),
];

export const searchValidator = [
  query("searchTerm").optional().isString().isLength({ max: 100 }),
  query("onlyUnlinked").optional().isBoolean().toBoolean(),
  query("companyId").optional({ values: "falsy" }).isInt({ min: 1 }),
];
