import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { getInvoiceFileService } from "../services/get_file.service";
import { invoiceActorOf } from "./actor";

// GET /invoice/:id/file — el archivo en sí (no JSON). Privado: no se guarda en
// caché del navegador ni de intermediarios.
export const getInvoiceFileController = asyncHandler(async (req: Request, res: Response) => {
  const file = await getInvoiceFileService(Number(req.params.id), invoiceActorOf(req.user as IToken));
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.fileName)}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(file.data);
});
