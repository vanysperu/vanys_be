import { InvoiceDriveStatus, InvoiceType } from "../model/invoice.model";

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
}

export interface UploadedInvoiceFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}
