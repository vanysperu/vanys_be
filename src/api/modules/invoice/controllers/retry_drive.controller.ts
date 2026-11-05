import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { retryInvoiceDriveService } from "../services/retry_drive.service";
import { invoiceActorOf } from "./actor";

// PUT /invoice/:id/drive-retry — vuelve a intentar la copia a Google Drive.
export const retryInvoiceDriveController = asyncHandler(async (req: Request, res: Response) => {
  const result = await retryInvoiceDriveService(Number(req.params.id), invoiceActorOf(req.user as IToken));
  ok(res, 200, result, result.copied ? "Factura copiada a Google Drive" : `No se pudo copiar: ${result.drive_error ?? "error desconocido"}`);
});
