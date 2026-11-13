import type { DocStatus, DocType } from "../model/inventory.models";

// Motivo de cada documento (plan §8.3).
export const REASONS: Record<DocType, readonly string[]> = {
  entry: ["purchase", "customer_return", "opening", "production", "other_entry"],
  exit: ["sale", "internal_use", "shrinkage", "sample", "supplier_return", "other_exit"],
  transfer: ["transfer"],
  adjustment: ["count_difference", "damage", "other_adjustment"],
};
// Documento que anula a otro ya confirmado (movimiento inverso).
export const REVERSAL_REASON = "reversal";
// Lo que no llegó en una transferencia y se da por perdido.
export const TRANSIT_LOSS_REASON = "transit_loss";

export interface WarehouseInput {
  business_unit_id: number;
  code: string;
  name: string;
  address?: string | null;
  ubigeo?: string | null;
  sunat_establishment_code?: string | null;
  allow_negative_stock: boolean;
  track_lots: boolean;
  track_expiry: boolean;
  expiry_alert_days: number;
  block_expired: boolean;
  is_default: boolean;
}

export interface WarehouseDto extends Required<Omit<WarehouseInput, "address" | "ubigeo" | "sunat_establishment_code">> {
  id: number;
  company_id: number;
  businessUnitName: string | null;
  address: string | null;
  ubigeo: string | null;
  sunat_establishment_code: string | null;
  active: boolean;
}

export interface DocumentLineInput {
  product_id: number;
  color?: string | null;
  // Salida de un almacén con lotes: lote elegido (sin lote = se reparte por FEFO).
  lot_id?: number | null;
  // Ingreso a un almacén con lotes: código del lote (sin código se genera).
  lot_code?: string | null;
  expiry_date?: string | null;
  // Ajuste: con signo. Resto: positiva.
  quantity: number;
  unit_cost?: number | null;
}

export interface DocumentInput {
  doc_type: DocType;
  warehouse_id: number;
  target_warehouse_id?: number | null;
  reason_code: string;
  document_date: string;
  supplier_id?: number | null;
  client_id?: number | null;
  quotation_id?: number | null;
  notes?: string | null;
  lines: DocumentLineInput[];
}

export interface DocumentLineDto {
  id: number;
  product_id: number;
  productName: string;
  color: string;
  lot_id: number | null;
  lotCode: string | null;
  expiry_date: string | null;
  quantity: number;
  received_quantity: number | null;
  // Solo con el permiso "Ver costos".
  unit_cost: number | null;
}

export interface DocumentDto {
  id: number;
  company_id: number;
  doc_type: DocType;
  reason_code: string;
  number: string;
  status: DocStatus;
  document_date: string;
  warehouse: { id: number; name: string };
  targetWarehouse: { id: number; name: string } | null;
  supplier_id: number | null;
  client_id: number | null;
  quotation_id: number | null;
  reversal_of_id: number | null;
  notes: string | null;
  cancel_reason: string | null;
  createdBy: string | null;
  createdAt: { date: string; time: string };
  postedAt: { date: string; time: string } | null;
  lines: DocumentLineDto[];
}

export interface ReceiveLineInput {
  line_id: number;
  // Lo que llega ahora (se suma a lo ya recibido).
  quantity: number;
}
