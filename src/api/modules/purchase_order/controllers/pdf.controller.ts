import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { generatePurchaseOrderPdf } from "../services/pdf/purchase_order_pdf.service";

// GET /purchase-order/:id/pdf — qué comprar, con foto y datos de cada
// producto (21-nov). En línea: el navegador lo muestra y desde ahí se descarga.
export const purchaseOrderPdfController = asyncHandler(async (req: Request, res: Response) => {
  const { fileName, pdf } = await generatePurchaseOrderPdf(Number(req.params.id), req.user as IToken);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${fileName}"`,
    "Content-Length": pdf.length,
    "Cache-Control": "private, no-store",
  });
  res.send(pdf);
});
