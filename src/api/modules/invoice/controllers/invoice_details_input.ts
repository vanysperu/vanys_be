import { Request } from "express";
import { InvoiceCurrency } from "../model/invoice.model";
import { InvoiceDetailsInput } from "../types/invoice.types";

const CURRENCIES: InvoiceCurrency[] = ["PEN", "USD"];
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
const positive = (value: unknown) => (Number(value) > 0 ? Number(value) : null);

// Datos de la factura ya validados por invoiceDetailsRules (vacío = sin dato).
export const invoiceDetailsOf = (req: Request): InvoiceDetailsInput => ({
  supplierId: positive(req.body.supplier_id),
  seriesNumber: text(req.body.series_number),
  issueDate: text(req.body.issue_date),
  currency: CURRENCIES.find((value) => value === req.body.currency) ?? null,
  total: positive(req.body.total),
});

export const allowDuplicateOf = (req: Request): boolean => req.body.allow_duplicate === true || req.body.allow_duplicate === "true";
