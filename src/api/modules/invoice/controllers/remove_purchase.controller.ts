import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { removeInvoicePurchaseService } from "../services/remove_purchase.service";
import { invoiceActorOf } from "./actor";

// PUT /invoice/:id/remove-purchase { purchase_id }
export const removeInvoicePurchaseController = asyncHandler(async (req: Request, res: Response) => {
  const result = await removeInvoicePurchaseService(Number(req.params.id), Number(req.body.purchase_id), invoiceActorOf(req.user as IToken));
  ok(res, 200, result, result.invoice_deleted ? "Compra quitada; la factura quedó sin compras y se eliminó" : "Compra quitada de la factura");
});
