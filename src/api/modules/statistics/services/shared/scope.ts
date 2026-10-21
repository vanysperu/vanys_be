import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { QuotationStatus } from "../../../quotation/model/quotation.model";
import { StatisticsScope } from "../../types/statistics.types";

// "Ganada": el cliente aceptó y la cotización siguió su curso.
export const WON_STATUSES: QuotationStatus[] = [
  "accepted",
  "design_pending",
  "in_process",
  "ready",
  "delivered",
  "finished",
];

// "Perdida": no se concretó (rechazada, vencida sin respuesta, o cancelada
// después de aceptada).
export const LOST_STATUSES: QuotationStatus[] = ["rejected", "expired", "cancelled"];

// Fecha de emisión en hora de Lima (created_at se guarda en UTC).
export const EMISSION_DATE_SQL = "DATE(CONVERT_TZ(q.created_at, '+00:00', '-05:00'))";

// Alcance sobre la cotización `q`, para métricas de cotizaciones (mismo
// criterio que Por cobrar).
export const QUOTATION_SCOPE_SQL = `q.is_deleted = false
  AND (:companyId IS NULL OR q.company_id = :companyId)
  AND (:businessUnitId IS NULL OR q.business_unit_id = :businessUnitId)`;

// Alcance para dinero (pagos y gastos vía su cotización `q`) — EXACTAMENTE el
// mismo filtro que usa Caja, para que los totales de ambos módulos cuadren.
export const MONEY_SCOPE_SQL = `(:companyId IS NULL OR q.company_id = :companyId)
  AND (:businessUnitId IS NULL OR q.business_unit_id = :businessUnitId)`;

// Movimientos manuales de caja `cm` (mismo filtro que Caja).
export const CASH_SCOPE_SQL = `cm.is_deleted = false
  AND (:companyId IS NULL OR cm.company_id = :companyId)
  AND (:businessUnitId IS NULL OR cm.business_unit_id = :businessUnitId)`;

export const scopeReplacements = (scope: StatisticsScope) => ({
  companyId: scope.companyId,
  businessUnitId: scope.businessUnitId,
  won: WON_STATUSES,
  lost: LOST_STATUSES,
});

// Todas las consultas del módulo son agregados de solo lectura con valores
// bindeados (nunca interpolados): los fragmentos de SQL de arriba son texto
// fijo del código.
export const selectRows = async <T>(sql: string, replacements: Record<string, unknown>): Promise<T[]> =>
  (await DataBase.instance.sequelize.query(sql, { type: QueryTypes.SELECT, replacements })) as T[];

// MySQL devuelve DECIMAL/SUM como texto: se pasa a número redondeado a 2.
export const toMoney = (value: unknown): number => Math.round(Number(value ?? 0) * 100) / 100;
export const toCount = (value: unknown): number => Number(value ?? 0);

// a / b, o null si no hay base para calcular (evita "0 %" engañosos).
export const ratio = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Math.round((numerator / denominator) * 10000) / 10000 : null;
