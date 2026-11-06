import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { AppError } from "../../../../../core/errors/AppError";
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
  // Factura de compra: su primera compra va en la tabla puente (después se le
  // pueden sumar más con linkPurchaseToInvoice).
  if (purchaseId !== null) {
    await createPurchaseLink({ invoiceId: Number(invoice.id), purchaseId, companyId, actorId, transaction });
  }
  return Number(invoice.id);
}

const createPurchaseLink = async ({
  invoiceId,
  purchaseId,
  companyId,
  actorId,
  transaction,
}: {
  invoiceId: number;
  purchaseId: number;
  companyId: number;
  actorId: number | null;
  transaction: Transaction;
}) => {
  const now = nowUtc();
  await DataBase.instance.invoice_purchase.create(
    {
      id: 0,
      invoice_id: invoiceId,
      purchase_id: purchaseId,
      company_id: companyId,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    },
    { transaction }
  );
};

/**
 * Suma una compra a una factura de compra YA registrada (pedido explícito del
 * usuario: "en una factura pueden estar varios productos"). La factura tiene
 * que ser de compra, de la misma empresa y de la misma tienda que la compra:
 * así nadie mezcla facturas entre tiendas ni empresas. Va en la transacción
 * de la compra y bloquea la factura mientras tanto.
 */
export async function linkPurchaseToInvoice({
  invoiceId,
  purchaseId,
  companyId,
  businessUnitId,
  actorId,
  transaction,
}: {
  invoiceId: number;
  purchaseId: number;
  companyId: number;
  businessUnitId: number | null;
  actorId: number | null;
  transaction: Transaction;
}): Promise<void> {
  const invoice = await DataBase.instance.invoice.findOne({
    where: { id: invoiceId },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  const invoiceStore = invoice?.business_unit_id === null || invoice?.business_unit_id === undefined ? null : Number(invoice.business_unit_id);
  const sameStore = invoiceStore === businessUnitId;
  if (!invoice || invoice.type !== "purchase" || Number(invoice.company_id) !== companyId || !sameStore) {
    throw new AppError(
      400,
      "La factura elegida no es una factura de compra de esta empresa y tienda",
      undefined,
      "INVOICE_NOT_LINKABLE"
    );
  }
  await createPurchaseLink({ invoiceId, purchaseId, companyId, actorId, transaction });
  await invoice.update({ updated_by: actorId, updated_at: nowUtc() }, { transaction });
}
