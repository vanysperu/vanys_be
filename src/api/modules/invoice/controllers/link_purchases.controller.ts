import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { AppError } from "../../../../core/errors/AppError";
import { linkPurchasesService } from "../services/link_purchases.service";
import { uploadInvoiceFileService } from "../services/upload_file.service";
import { invoiceActorOf } from "./actor";
import { allowDuplicateOf, invoiceDetailsOf } from "./invoice_details_input";

// POST /invoice/link-purchases (JSON o multipart con "file" opcional):
// purchase_ids + invoice_id (sumar a una ya registrada) o los datos de una
// factura nueva. El vínculo va en una transacción; el archivo se guarda
// enseguida con las mismas reglas de "Subir archivo". Si el archivo falla
// (p. ej. Drive sin conectar), la factura queda registrada sin archivo, en
// "Faltan subir", y la respuesta lo dice: el vínculo no se pierde.
export const linkPurchasesController = asyncHandler(async (req: Request, res: Response) => {
  const actor = invoiceActorOf(req.user as IToken);
  const result = await linkPurchasesService(
    {
      purchaseIds: req.body.purchase_ids as number[],
      invoiceId: Number(req.body.invoice_id) > 0 ? Number(req.body.invoice_id) : undefined,
      details: invoiceDetailsOf(req),
      allowDuplicate: allowDuplicateOf(req),
    },
    actor
  );
  const status = result.created ? 201 : 200;
  if (!req.file) return ok(res, status, { ...result, file_uploaded: false, file_error: null }, "Factura vinculada correctamente");

  try {
    await uploadInvoiceFileService(result.invoice_id, req.file, actor);
    return ok(res, status, { ...result, file_uploaded: true, file_error: null }, "Factura vinculada y archivo guardado");
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return ok(
      res,
      status,
      { ...result, file_uploaded: false, file_error: error.message },
      `Factura vinculada, pero el archivo no se guardó: ${error.message}`
    );
  }
});
