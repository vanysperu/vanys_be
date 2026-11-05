import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { nowUtc } from "../../../../utils/dateUtils";
import { InvoiceActor } from "../types/invoice.types";
import { copyInvoiceToDrive } from "./shared/drive_copy";
import { loadInvoiceForActor } from "./shared/invoice_scope";

// "Reintentar copia": vuelve a intentar ya (y reinicia el tope de reintentos
// automáticos). Responde si quedó copiada; si no, el motivo queda en la factura.
export async function retryInvoiceDriveService(id: number, actor: InvoiceActor) {
  const invoice = await loadInvoiceForActor(id, actor);
  if (!invoice.stored_in_system || !["pending", "failed"].includes(invoice.drive_status)) {
    throw new AppError(409, "Esta factura no tiene una copia a Drive pendiente", undefined, "INVOICE_DRIVE_NOT_PENDING");
  }

  await DataBase.instance.invoice.update(
    { drive_attempts: 0, drive_next_attempt_at: null, updated_by: actor.userId, updated_at: nowUtc() },
    { where: { id } }
  );
  const copied = await copyInvoiceToDrive(id);
  const updated = await DataBase.instance.invoice.findByPk(id, { attributes: ["drive_status", "drive_error"] });
  return { id, copied, drive_status: updated?.drive_status ?? "failed", drive_error: updated?.drive_error ?? null };
}
