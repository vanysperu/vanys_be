import { InvoiceCurrency, InvoiceDriveStatus, InvoiceType } from "../model/invoice.model";
import { PurchaseInvoiceStatus } from "../../purchase_order/model/purchase_order_item_purchase.model";

export interface LocalDateTime {
  date: string;
  time: string;
}

// Quién hace la acción (desde la sesión, nunca del body). businessUnitId =
// tienda a la que está limitado (undefined = ve todas las de su empresa).
export interface InvoiceActor {
  userId: number;
  isSystem: boolean;
  companyId: number | null;
  businessUnitId: number | undefined;
  // Tienda a la que está atado para ESCRIBIR (vincular compras, D8). El
  // permiso "ver todas las tiendas" es solo de lectura: no la amplía.
  writeBusinessUnitId: number | undefined;
}

// Una compra cubierta por una factura de compra (una factura puede cubrir
// varios productos, incluso de cotizaciones distintas de la misma tienda).
export interface InvoicePurchaseLine {
  purchase_id: number;
  product_name: string;
  quantity: number;
  amount: number;
  quotation_code: string;
}

export interface InvoiceDto {
  id: number;
  type: InvoiceType;
  quotation_id: number;
  quotation_code: string;
  // Todas las cotizaciones que cubre (la principal primero).
  quotation_codes: string[];
  // Compras vigentes de la factura (vacío en una emitida).
  purchases: InvoicePurchaseLine[];
  // Suma de esas compras (0 en una emitida).
  purchases_total: number;
  description: string;
  // Datos de la factura de compra (Sprint 2, ítem 3; opcionales).
  supplier_id: number | null;
  supplier_name: string | null;
  series_number: string | null;
  issue_date: string | null;
  currency: InvoiceCurrency | null;
  total: number | null;
  // null = junta compras de varias tiendas (solo un admin de empresa, D8).
  business_unit_id: number | null;
  company_id: number;
  company_name: string | null;
  // false = falta subir el archivo.
  has_file: boolean;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  file_uploaded_at: LocalDateTime | null;
  file_uploaded_by_name: string | null;
  stored_in_system: boolean;
  drive_status: InvoiceDriveStatus;
  drive_error: string | null;
  created_at: LocalDateTime;
  created_by_name: string | null;
}

// GET /invoice/purchase-candidates: factura a la que se puede sumar una compra.
export interface PurchaseInvoiceCandidate {
  id: number;
  series_number: string | null;
  supplier_name: string | null;
  quotation_codes: string[];
  description: string;
  has_file: boolean;
  created_at: LocalDateTime;
  created_by_name: string | null;
}

export interface InvoiceListFilter {
  companyId: number | null;
  businessUnitId?: number;
  type?: InvoiceType;
  // pending = falta subir; uploaded = con archivo.
  file?: "pending" | "uploaded";
  drive?: InvoiceDriveStatus;
  supplierId?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}

export interface InvoiceListSummary {
  // Facturas sin archivo (con los mismos filtros, menos el de archivo).
  pending_count: number;
  // Copias a Drive que fallaron.
  drive_failed_count: number;
  // Compras con la factura pendiente (pestaña "Compras sin factura").
  pending_purchases_count: number;
}

// ---- Compras sin factura (Sprint 2, ítem 3) ----

export interface PendingPurchaseFilter {
  companyId: number | null;
  // Tienda del usuario (lectura); undefined = todas las de su empresa.
  businessUnitId?: number;
  // Un admin puede filtrar por una tienda puntual de su empresa.
  storeId?: number;
  includeNotRequired: boolean;
  quotationId?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}

export interface PendingPurchaseDto {
  purchase_id: number;
  invoice_status: PurchaseInvoiceStatus;
  product_name: string;
  quantity: number;
  amount: number;
  quotation_id: number;
  quotation_code: string;
  client_name: string | null;
  company_id: number;
  business_unit_id: number | null;
  business_unit_name: string | null;
  spent_at: string;
  created_at: LocalDateTime;
  created_by_name: string | null;
}

export interface InvoiceDetailsInput {
  supplierId?: number | null;
  seriesNumber?: string | null;
  issueDate?: string | null;
  currency?: InvoiceCurrency | null;
  total?: number | null;
}

// POST /invoice/link-purchases: una factura nueva (con sus datos) o una ya registrada.
export interface LinkPurchasesInput {
  purchaseIds: number[];
  invoiceId?: number;
  details: InvoiceDetailsInput;
  // true = la persona confirmó que la factura repite proveedor + serie-número.
  allowDuplicate: boolean;
}

export interface LinkPurchasesResult {
  invoice_id: number;
  created: boolean;
  linked_purchase_ids: number[];
}

export interface UploadedInvoiceFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}
