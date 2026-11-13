import { body, param, query } from "express-validator";
import { DOC_STATUSES, DOC_TYPES } from "../model/inventory.models";
import { MAX_DOCUMENT_LINES } from "../services/shared/document_lines";

const idParam = param("id").isInt({ min: 1 }).withMessage("El id no es válido").toInt();
const companyQuery = query("companyId").optional({ values: "falsy" }).isInt({ min: 1 });
const dateOnly = (field: string, label: string) =>
  body(field).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage(`${label}: la fecha va como AAAA-MM-DD`);

export const idValidator = [idParam];
export const companyQueryValidator = [companyQuery];

export const warehouseValidator = [
  body("company_id").optional({ values: "null" }).isInt({ min: 1 }),
  body("business_unit_id").isInt({ min: 1 }).withMessage("Elige la tienda").toInt(),
  body("code").isString().trim().matches(/^[A-Za-z0-9-]{1,20}$/).withMessage("El código: letras, números o guiones (máximo 20)"),
  body("name").isString().trim().isLength({ min: 1, max: 120 }).withMessage("El nombre es obligatorio (máximo 120)"),
  body("address").optional({ values: "null" }).isString().isLength({ max: 255 }),
  body("ubigeo").optional({ values: "falsy" }).matches(/^\d{6}$/).withMessage("El ubigeo tiene 6 dígitos"),
  body("sunat_establishment_code").optional({ values: "falsy" }).matches(/^\d{4}$/).withMessage("El código de establecimiento SUNAT tiene 4 dígitos"),
  body("allow_negative_stock").isBoolean().toBoolean(),
  body("track_lots").isBoolean().toBoolean(),
  body("track_expiry").isBoolean().toBoolean(),
  body("expiry_alert_days").isInt({ min: 0, max: 365 }).withMessage("Los días de aviso van de 0 a 365").toInt(),
  body("block_expired").isBoolean().toBoolean(),
  body("is_default").isBoolean().toBoolean(),
];
export const updateWarehouseValidator = [idParam, ...warehouseValidator];

export const listWarehousesValidator = [
  companyQuery,
  query("onlyActive").optional().isBoolean().toBoolean(),
  query("businessUnitId").optional({ values: "falsy" }).isInt({ min: 1 }).toInt(),
];

export const storeSettingsValidator = [
  idParam,
  body("inventory_enabled").isBoolean().withMessage("Indica si la tienda usa almacén").toBoolean(),
  body("inventory_exit_on").isIn(["delivered", "dispatch_guide"]).withMessage("Elige cuándo descuenta una venta"),
];

export const tracksStockValidator = [
  body("company_id").optional({ values: "null" }).isInt({ min: 1 }),
  body("tracksStock").isBoolean().withMessage("Indica si manejan stock").toBoolean(),
  body("all").optional().isBoolean().toBoolean(),
  body("productIds").optional().isArray({ max: 500 }).withMessage("Hasta 500 productos a la vez"),
  body("productIds.*").isInt({ min: 1 }).toInt(),
];

const documentBody = [
  body("warehouse_id").isInt({ min: 1 }).withMessage("Elige el almacén").toInt(),
  body("target_warehouse_id").optional({ values: "null" }).isInt({ min: 1 }).toInt(),
  body("reason_code").isString().isLength({ min: 1, max: 30 }).withMessage("Elige el motivo"),
  dateOnly("document_date", "Fecha"),
  body("supplier_id").optional({ values: "null" }).isInt({ min: 1 }).toInt(),
  body("client_id").optional({ values: "null" }).isInt({ min: 1 }).toInt(),
  body("quotation_id").optional({ values: "null" }).isInt({ min: 1 }).toInt(),
  body("notes").optional({ values: "null" }).isString().isLength({ max: 500 }).withMessage("Las notas tienen máximo 500 caracteres"),
  body("lines").isArray({ min: 1, max: MAX_DOCUMENT_LINES }).withMessage(`Agrega entre 1 y ${MAX_DOCUMENT_LINES} productos`),
  body("lines.*.product_id").isInt({ min: 1 }).withMessage("Cada línea necesita su producto").toInt(),
  body("lines.*.color").optional({ values: "null" }).isString().isLength({ max: 60 }),
  body("lines.*.lot_id").optional({ values: "null" }).isInt({ min: 1 }).toInt(),
  body("lines.*.lot_code").optional({ values: "null" }).isString().isLength({ max: 40 }),
  body("lines.*.expiry_date").optional({ values: "falsy" }).matches(/^\d{4}-\d{2}-\d{2}$/).withMessage("El vencimiento va como AAAA-MM-DD"),
  body("lines.*.quantity").isFloat().withMessage("Cada línea necesita su cantidad").toFloat(),
  body("lines.*.unit_cost").optional({ values: "null" }).isFloat({ min: 0 }).withMessage("El costo no es válido").toFloat(),
];
export const createDocumentValidator = [
  body("company_id").optional({ values: "null" }).isInt({ min: 1 }),
  body("doc_type").isIn(DOC_TYPES).withMessage("El tipo de documento no es válido"),
  ...documentBody,
];
export const updateDocumentValidator = [idParam, ...documentBody];

export const cancelDocumentValidator = [
  idParam,
  body("reason").isString().trim().isLength({ min: 3, max: 255 }).withMessage("Indica por qué se anula (3 a 255 caracteres)"),
];

export const receiveTransferValidator = [
  idParam,
  body("lines").isArray({ max: MAX_DOCUMENT_LINES }).withMessage("Indica lo recibido por línea"),
  body("lines.*.line_id").isInt({ min: 1 }).toInt(),
  body("lines.*.quantity").isFloat({ min: 0 }).withMessage("Lo recibido no puede ser negativo").toFloat(),
  body("closeDifference").optional().isBoolean().toBoolean(),
];

export const listDocumentsValidator = [
  companyQuery,
  query("docType").optional({ values: "falsy" }).isIn(DOC_TYPES),
  query("status").optional({ values: "falsy" }).isIn(DOC_STATUSES),
  query("warehouseId").optional({ values: "falsy" }).isInt({ min: 1 }).toInt(),
  query("dateFrom").optional({ values: "falsy" }).matches(/^\d{4}-\d{2}-\d{2}$/),
  query("dateTo").optional({ values: "falsy" }).matches(/^\d{4}-\d{2}-\d{2}$/),
];

export const listStockValidator = [
  companyQuery,
  query("warehouseId").optional({ values: "falsy" }).isInt({ min: 1 }).toInt(),
  query("searchTerm").optional().isString().isLength({ max: 100 }),
  query("includeZero").optional().isBoolean().toBoolean(),
];

export const kardexValidator = [
  companyQuery,
  query("productId").isInt({ min: 1 }).withMessage("Elige el producto").toInt(),
  query("color").optional().isString().isLength({ max: 60 }),
  query("warehouseId").optional({ values: "falsy" }).isInt({ min: 1 }).toInt(),
  query("dateFrom").optional({ values: "falsy" }).matches(/^\d{4}-\d{2}-\d{2}$/),
  query("dateTo").optional({ values: "falsy" }).matches(/^\d{4}-\d{2}-\d{2}$/),
];

export const suggestLotsValidator = [
  query("warehouseId").isInt({ min: 1 }).toInt(),
  query("productId").isInt({ min: 1 }).toInt(),
  query("color").optional().isString().isLength({ max: 60 }),
];

export const stockByProductsValidator = [
  companyQuery,
  query("productIds").isString().matches(/^\d+(,\d+){0,99}$/).withMessage("Indica hasta 100 productos separados por coma"),
];
