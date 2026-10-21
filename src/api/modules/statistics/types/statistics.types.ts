import { QuotationStatus } from "../../quotation/model/quotation.model";

// Agrupación de la tendencia: por día en rangos cortos, por mes en largos.
export type TrendGranularity = "day" | "month";

export interface StatisticsPeriod {
  // Fechas de Lima, YYYY-MM-DD, inclusivas.
  date_from: string;
  date_to: string;
  // Periodo anterior de la misma duración, para comparar.
  previous_from: string;
  previous_to: string;
  granularity: TrendGranularity;
}

// Alcance de datos ya resuelto desde la sesión (nunca desde el frontend):
// companyId null = Super Administrador sin empresa elegida (todas).
export interface StatisticsScope {
  companyId: number | null;
  businessUnitId: number | null;
}

export interface KpiValues {
  // Cotizaciones emitidas en el periodo (todas, cualquiera sea su estado).
  quoted_amount: number;
  quoted_count: number;
  // Emitidas en el periodo que el cliente aceptó (o ya avanzaron más).
  won_amount: number;
  won_count: number;
  // Emitidas en el periodo rechazadas, vencidas o canceladas.
  lost_count: number;
  // Emitidas en el periodo que siguen esperando respuesta del cliente.
  pending_count: number;
  // ganadas / (ganadas + perdidas); null si todavía no se decidió ninguna.
  conversion_rate: number | null;
  // Monto promedio de una cotización ganada; null si no hubo ninguna.
  average_ticket: number | null;
  // Caja del periodo: pagos de clientes, otros ingresos y egresos.
  collected: number;
  other_income: number;
  expenses: number;
  net_cash: number;
  // Margen de las ganadas del periodo: subtotal (sin IGV) - gastos
  // registrados en esas cotizaciones. Estimado: un gasto aún no cargado no
  // cuenta.
  margin_amount: number;
  margin_rate: number | null;
}

export interface TrendPoint {
  // "2026-10" (mes) o "2026-10-21" (día).
  bucket: string;
  quoted: number;
  won: number;
  // Pagos de clientes + otros ingresos de caja.
  income: number;
  expenses: number;
}

export interface StatusBreakdownItem {
  status: QuotationStatus;
  count: number;
  amount: number;
}

export interface TopClientItem {
  client_id: number;
  name: string;
  amount: number;
  count: number;
}

export interface TopProductItem {
  product_id: number;
  name: string;
  amount: number;
  units: number;
}

export interface TopTechniqueItem {
  technique_id: number;
  name: string;
  units: number;
  quotations: number;
}

export type AgingBucket = "0-30" | "31-60" | "61-90" | "91+";

export interface AgingItem {
  bucket: AgingBucket;
  amount: number;
  count: number;
}

export interface PaymentsByAccountItem {
  label: string;
  amount: number;
  count: number;
}

export interface SellerItem {
  user_id: number | null;
  name: string;
  quoted_count: number;
  quoted_amount: number;
  won_count: number;
  won_amount: number;
  lost_count: number;
  conversion_rate: number | null;
  // Pagos cobrados en el periodo sobre cotizaciones de este vendedor.
  collected: number;
}

export interface StatisticsOverview {
  period: StatisticsPeriod;
  kpis: { current: KpiValues; previous: KpiValues };
  trend: TrendPoint[];
  status_breakdown: StatusBreakdownItem[];
  top_clients: TopClientItem[];
  top_products: TopProductItem[];
  top_techniques: TopTechniqueItem[];
  // Foto de hoy (no depende del periodo): saldos por antigüedad.
  receivables_aging: AgingItem[];
  payments_by_account: PaymentsByAccountItem[];
  sellers: SellerItem[];
}
