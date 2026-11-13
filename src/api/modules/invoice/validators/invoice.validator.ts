import { body, param, query } from "express-validator";

export const invoiceIdValidator = [param("id").isInt({ gt: 0 }).withMessage("La factura no es válida").toInt()];

// Facturas a las que se puede sumar la compra de un item.
export const purchaseCandidatesValidator = [
  query("itemId").isInt({ gt: 0 }).withMessage("El item no es válido").toInt(),
  query("search").optional({ values: "falsy" }).isString().isLength({ max: 100 }).withMessage("Máximo 100 caracteres"),
];

export const listInvoicesValidator = [
  query("companyId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("La empresa no es válida"),
  query("type").optional({ values: "falsy" }).isIn(["issued", "purchase"]).withMessage("El tipo no es válido"),
  query("file").optional({ values: "falsy" }).isIn(["pending", "uploaded"]).withMessage("El filtro de archivo no es válido"),
  query("drive").optional({ values: "falsy" }).isIn(["none", "pending", "copied", "failed"]).withMessage("El estado de Drive no es válido"),
  query("supplierId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("El proveedor no es válido"),
  query("search").optional({ values: "falsy" }).isString().isLength({ max: 100 }),
  query("dateFrom").optional({ values: "falsy" }).isISO8601().withMessage("dateFrom no es una fecha válida"),
  query("dateTo").optional({ values: "falsy" }).isISO8601().withMessage("dateTo no es una fecha válida"),
];

// ---- Compras sin factura (Sprint 2, ítem 3) ----

export const pendingPurchasesValidator = [
  query("companyId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("La empresa no es válida"),
  query("storeId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("La tienda no es válida"),
  query("quotationId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("La cotización no es válida"),
  query("includeNotRequired").optional({ values: "falsy" }).isIn(["true", "false"]).withMessage("includeNotRequired debe ser true o false"),
  query("search").optional({ values: "falsy" }).isString().isLength({ max: 100 }),
  query("dateFrom").optional({ values: "falsy" }).isISO8601().withMessage("dateFrom no es una fecha válida"),
  query("dateTo").optional({ values: "falsy" }).isISO8601().withMessage("dateTo no es una fecha válida"),
];

// Datos opcionales de la factura de compra (D9). Llegan por multipart (texto)
// o JSON: vacío = sin dato.
const invoiceDetailsRules = [
  body("supplier_id").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("El proveedor no es válido").toInt(),
  body("series_number")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .matches(/^[A-Za-z0-9]{1,4}\s*-\s*\d{1,10}$/)
    .withMessage("Escribe la serie y el número así: F001-123"),
  body("issue_date").optional({ values: "falsy" }).isISO8601({ strict: true }).withMessage("La fecha de emisión no es válida"),
  body("currency").optional({ values: "falsy" }).isIn(["PEN", "USD"]).withMessage("La moneda debe ser PEN o USD"),
  body("total").optional({ values: "falsy" }).isFloat({ gt: 0, max: 99999999.99 }).withMessage("El total debe ser mayor a 0").toFloat(),
  body("allow_duplicate").optional().isIn([true, false, "true", "false"]).withMessage("allow_duplicate debe ser verdadero o falso"),
];

// purchase_ids: arreglo JSON ([1,2]) o texto "1,2" (multipart, con archivo).
const parsePurchaseIds = (value: unknown): number[] => {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return raw.map((id) => Number(String(id).trim())).filter((id) => Number.isInteger(id) && id > 0);
};

export const linkPurchasesValidator = [
  body("purchase_ids")
    .customSanitizer(parsePurchaseIds)
    .custom((ids: number[]) => ids.length > 0 && ids.length <= 100)
    .withMessage("Elige entre 1 y 100 compras"),
  body("invoice_id").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("La factura elegida no es válida").toInt(),
  ...invoiceDetailsRules,
];

export const updateInvoiceDetailsValidator = [...invoiceIdValidator, ...invoiceDetailsRules];

export const removeInvoicePurchaseValidator = [
  ...invoiceIdValidator,
  body("purchase_id").isInt({ gt: 0 }).withMessage("La compra no es válida").toInt(),
];
