import { Op, Transaction, WhereOptions } from "sequelize";
import { InvoiceAttributes } from "../../model/invoice.model";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { InvoiceDetailsInput } from "../../types/invoice.types";
import { InvoiceDetails } from "./register_invoice";

// "f001 - 123" -> "F001-123": así el aviso de factura repetida no depende de
// cómo la tipeó cada persona.
export const normalizeSeriesNumber = (value: string | null | undefined): string | null => {
  const clean = (value ?? "").toUpperCase().replace(/\s+/g, "");
  return clean ? clean.slice(0, 30) : null;
};

/**
 * Valida y normaliza los datos opcionales de una factura de compra (D9):
 * el proveedor tiene que ser de la MISMA empresa que la factura (nunca uno que
 * mande el frontend de otra empresa) y estar activo.
 */
export async function resolveInvoiceDetails(
  input: InvoiceDetailsInput,
  companyId: number,
  transaction: Transaction
): Promise<InvoiceDetails> {
  const supplierId = input.supplierId ?? null;
  if (supplierId !== null) {
    const supplier = await DataBase.instance.supplier.findOne({
      where: { id: supplierId, company_id: companyId, active: true },
      attributes: ["id"],
      transaction,
    });
    if (!supplier) throw new AppError(400, "El proveedor no existe o no es de esta empresa", undefined, "SUPPLIER_NOT_FOUND");
  }
  return {
    supplierId,
    seriesNumber: normalizeSeriesNumber(input.seriesNumber),
    issueDate: input.issueDate ?? null,
    currency: input.currency ?? null,
    total: input.total ?? null,
  };
}

/**
 * Aviso de factura repetida (plan §4, punto 6): misma empresa, mismo proveedor
 * y misma serie-número. No es un bloqueo: la persona puede confirmar (por
 * ejemplo, si de verdad son dos documentos distintos que el proveedor numeró
 * igual), igual que la compra por encima de lo pedido.
 */
export async function assertNotDuplicateInvoice({
  companyId,
  details,
  exceptInvoiceId,
  allowDuplicate,
  transaction,
}: {
  companyId: number;
  details: InvoiceDetails;
  exceptInvoiceId: number | null;
  allowDuplicate: boolean;
  transaction: Transaction;
}): Promise<void> {
  if (allowDuplicate || !details.supplierId || !details.seriesNumber) return;
  // Lista de condiciones + Op.and: un `where` armado con spreads condicionales
  // dispara el chequeo de tipos de Sequelize (ver product.service.ts).
  const conditions: WhereOptions<InvoiceAttributes>[] = [
    { company_id: companyId },
    { supplier_id: details.supplierId },
    { series_number: details.seriesNumber },
  ];
  if (exceptInvoiceId !== null) conditions.push({ id: { [Op.ne]: exceptInvoiceId } });
  const duplicate = await DataBase.instance.invoice.findOne({
    where: { [Op.and]: conditions },
    attributes: ["id"],
    transaction,
  });
  if (!duplicate) return;
  throw new AppError(
    409,
    `Ya hay una factura ${details.seriesNumber} de este proveedor. ¿Seguro que es otra?`,
    { invoice_id: Number(duplicate.id) },
    "INVOICE_DUPLICATE_NUMBER"
  );
}
