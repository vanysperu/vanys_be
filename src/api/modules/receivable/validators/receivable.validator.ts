import { query } from "express-validator";
import { QUOTATION_STATUSES } from "../../quotation/model/quotation.model";

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const listReceivablesValidator = [
  query("page").optional().isInt({ gt: 0 }).withMessage("La página debe ser un número entero positivo"),
  query("limit").optional().isInt({ gt: 0, max: 100 }).withMessage("El límite debe estar entre 1 y 100"),
  query("status").optional({ values: "falsy" }).isIn(QUOTATION_STATUSES).withMessage("Estado inválido"),
  query("clientName").optional({ values: "falsy" }).isString().isLength({ max: 255 }),
  query("dateFrom").optional({ values: "falsy" }).matches(isoDate).withMessage("Fecha inválida (YYYY-MM-DD)"),
  query("dateTo").optional({ values: "falsy" }).matches(isoDate).withMessage("Fecha inválida (YYYY-MM-DD)"),
  query("orderBy").optional({ values: "falsy" }).isIn(["created_at", "balance", "total"]).withMessage("Orden inválido"),
  query("orderDir").optional({ values: "falsy" }).isIn(["asc", "desc"]).withMessage("Dirección de orden inválida"),
];
