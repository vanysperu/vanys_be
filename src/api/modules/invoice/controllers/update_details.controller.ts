import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { updateInvoiceDetailsService } from "../services/update_details.service";
import { invoiceActorOf } from "./actor";
import { allowDuplicateOf, invoiceDetailsOf } from "./invoice_details_input";

// PUT /invoice/:id/details { supplier_id, series_number, issue_date, currency, total, allow_duplicate }
export const updateInvoiceDetailsController = asyncHandler(async (req: Request, res: Response) => {
  const result = await updateInvoiceDetailsService(
    Number(req.params.id),
    invoiceDetailsOf(req),
    allowDuplicateOf(req),
    invoiceActorOf(req.user as IToken)
  );
  ok(res, 200, result, "Datos de la factura guardados");
});
