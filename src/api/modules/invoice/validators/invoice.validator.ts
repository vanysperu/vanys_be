import { param, query } from "express-validator";

export const invoiceIdValidator = [param("id").isInt({ gt: 0 }).withMessage("La factura no es válida").toInt()];

export const listInvoicesValidator = [
  query("companyId").optional({ values: "falsy" }).isInt({ gt: 0 }).withMessage("La empresa no es válida"),
  query("type").optional({ values: "falsy" }).isIn(["issued", "purchase"]).withMessage("El tipo no es válido"),
  query("file").optional({ values: "falsy" }).isIn(["pending", "uploaded"]).withMessage("El filtro de archivo no es válido"),
  query("drive").optional({ values: "falsy" }).isIn(["none", "pending", "copied", "failed"]).withMessage("El estado de Drive no es válido"),
  query("search").optional({ values: "falsy" }).isString().isLength({ max: 100 }),
  query("dateFrom").optional({ values: "falsy" }).isISO8601().withMessage("dateFrom no es una fecha válida"),
  query("dateTo").optional({ values: "falsy" }).isISO8601().withMessage("dateTo no es una fecha válida"),
];
