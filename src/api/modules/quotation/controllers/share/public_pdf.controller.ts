import { Request, Response } from "express";
import { asyncHandler } from "../../../../../core/utils/asyncHandler";
import { getPublicQuotationPdf } from "../../services/share/public_pdf.service";
import { setPrivatePageHeaders } from "./public_view.controller";

// GET /api/public/q/:code/pdf — PÚBLICO: el PDF de la cotización compartida.
// `inline`: el celular lo abre en su visor; desde ahí se descarga o se comparte.
export const publicQuotationPdfController = asyncHandler(async (req: Request, res: Response) => {
  const { fileName, pdf } = await getPublicQuotationPdf(String(req.params.code));
  setPrivatePageHeaders(res);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `inline; filename="${fileName}"`,
    "Content-Length": pdf.length,
  });
  res.send(pdf);
});
