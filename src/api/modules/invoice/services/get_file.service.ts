import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { downloadFromCompanyDrive } from "../../google_drive/services/shared/company_drive";
import { DriveError } from "../../google_drive/services/shared/drive_client";
import { InvoiceActor } from "../types/invoice.types";
import { loadInvoiceForActor } from "./shared/invoice_scope";

/**
 * Archivo de una factura, solo con sesión (las facturas nunca tienen una URL
 * pública). Sale del sistema y, si la empresa guarda solo en Drive, de su Drive.
 */
export async function getInvoiceFileService(
  id: number,
  actor: InvoiceActor
): Promise<{ data: Buffer; mimeType: string; fileName: string }> {
  const invoice = await loadInvoiceForActor(id, actor);
  if (!invoice.file_name || !invoice.mime_type) {
    throw new AppError(404, "Esta factura todavía no tiene archivo", undefined, "INVOICE_FILE_MISSING");
  }

  if (invoice.stored_in_system) {
    const stored = await DataBase.instance.invoice_file.findOne({ where: { invoice_id: id } });
    if (stored) return { data: Buffer.from(stored.data), mimeType: invoice.mime_type, fileName: invoice.file_name };
  }
  if (!invoice.drive_file_id) throw new AppError(404, "No se encontró el archivo de la factura", undefined, "INVOICE_FILE_MISSING");

  try {
    const data = await downloadFromCompanyDrive(Number(invoice.company_id), invoice.drive_file_id);
    return { data, mimeType: invoice.mime_type, fileName: invoice.file_name };
  } catch (error) {
    if (error instanceof DriveError) throw new AppError(502, `No se pudo leer de Google Drive: ${error.message}`, undefined, "DRIVE_DOWNLOAD_FAILED");
    throw error;
  }
}
