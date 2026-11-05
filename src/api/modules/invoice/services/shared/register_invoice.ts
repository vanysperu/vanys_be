import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { InvoiceType } from "../../model/invoice.model";

// Largo de la columna invoice.description.
const DESCRIPTION_MAX = 255;

/**
 * Deja registrada una factura SIN archivo todavía (pedido explícito del
 * usuario): al comprar se marca si llevaba factura y al cerrar una cotización
 * si se emitió. El archivo se sube en el mismo momento o después; mientras
 * falte, la factura sale en "Faltan subir". Va dentro de la transacción del
 * llamador: si la compra o el cambio de estado fallan, no queda la factura.
 */
export async function registerInvoice({
  companyId,
  businessUnitId,
  type,
  quotationId,
  purchaseId,
  description,
  actorId,
  transaction,
}: {
  companyId: number;
  businessUnitId: number | null;
  type: InvoiceType;
  quotationId: number;
  purchaseId: number | null;
  description: string;
  actorId: number | null;
  transaction: Transaction;
}): Promise<number> {
  const now = nowUtc();
  const invoice = await DataBase.instance.invoice.create(
    {
      id: 0,
      company_id: companyId,
      business_unit_id: businessUnitId,
      type,
      quotation_id: quotationId,
      purchase_id: purchaseId,
      description: description.slice(0, DESCRIPTION_MAX),
      file_name: null,
      mime_type: null,
      size_bytes: null,
      file_uploaded_at: null,
      file_uploaded_by: null,
      stored_in_system: false,
      drive_status: "none",
      drive_file_id: null,
      drive_error: null,
      drive_attempts: 0,
      drive_next_attempt_at: null,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    },
    { transaction }
  );
  return Number(invoice.id);
}
