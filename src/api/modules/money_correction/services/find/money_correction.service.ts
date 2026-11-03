import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";
import { toDateOnlyString, utcToBusinessParts } from "../../../../../utils/dateUtils";
import { fromCents, toCents } from "../../../../../core/utils/money";
import {
  AllocationSnapshot,
  ListMoneyCorrectionsInput,
  MoneyCorrectionAdjustmentPosting,
  MoneyCorrectionAdjustmentSummary,
  MoneyCorrectionKind,
  MoneyCorrectionListItem,
  MoneyCorrectionSource,
  MoneyCorrectionValues,
} from "../../types/money_correction.types";

// Claves que cada fuente puede guardar en previous_values/new_values. Al
// leer, solo pasan estas (lista blanca): un JSON inesperado nunca llega
// crudo al cliente. Si una fuente empieza a guardar un campo nuevo, se agrega
// acá en el mismo cambio.
const COMMON_ACCOUNT_KEYS = ["payment_account_id", "payment_account_name"] as const;

// Anular/restaurar una fila de un mes CERRADO se guarda como ajuste
// (kind='adjustment') con { is_deleted: 0 } -> { is_deleted: 1 } (o al revés).
const ANNULMENT_KEY = "is_deleted";

export const MONEY_CORRECTION_VALUE_KEYS: Record<MoneyCorrectionSource, readonly string[]> = {
  manual: [
    "amount",
    "category",
    "occurred_at",
    ...COMMON_ACCOUNT_KEYS,
    "description",
    "quotation_id",
    "purchase_order_id",
    ANNULMENT_KEY,
  ],
  quotation_payment: [
    "amount",
    "method",
    "paid_at",
    ...COMMON_ACCOUNT_KEYS,
    "operation_number",
    "notes",
    ANNULMENT_KEY,
  ],
  // Gasto manual de una cotización y compra de una orden (que se guarda
  // como su gasto): la compra suma cantidad, quién la pagó y la foto de la
  // deuda con el trabajador.
  quotation_expense: [
    "amount",
    "description",
    "category",
    "spent_at",
    ...COMMON_ACCOUNT_KEYS,
    "quantity",
    "funding_source",
    "paid_by_user_id",
    "paid_by_user_name",
    "debt_amount",
    "debt_status",
    ANNULMENT_KEY,
  ],
  employee_debt: [
    "amount",
    "description",
    "category",
    "incurred_at",
    "business_unit_id",
    "business_unit_name",
    "user_id",
    "user_name",
    "debt_status",
  ],
  employee_debt_payment: ["amount", "paid_at", ...COMMON_ACCOUNT_KEYS, "allocations", ANNULMENT_KEY],
};

// Única clave que admite un arreglo (las asignaciones de una reposición).
const ALLOCATIONS_KEY = "allocations";

interface RawCorrectionRow {
  id: number;
  source_type: MoneyCorrectionSource;
  source_id: number;
  kind: MoneyCorrectionKind;
  previous_values: unknown;
  new_values: unknown;
  reason: string;
  created_by: number;
  created_by_name: string | null;
  created_at: Date;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// MySQL devuelve JSON ya parseado; MariaDB (JSON = LONGTEXT) lo devuelve como
// texto. Se aceptan ambos; un texto que no es JSON válido se trata como vacío
// (la base ya lo valida, esto es solo defensa).
const parseJson = (raw: unknown): unknown => {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const parseAllocations = (value: unknown): AllocationSnapshot[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainObject).map((item) => ({
    employee_debt_id: Number(item.employee_debt_id),
    amount: Number(item.amount),
  }));
};

const parseValue = (key: string, value: unknown): string | number | null | AllocationSnapshot[] => {
  if (key === ALLOCATIONS_KEY) return parseAllocations(value);
  if (typeof value === "string" || typeof value === "number") return value;
  return null;
};

export const parseMoneyCorrectionValues = (raw: unknown, sourceType: MoneyCorrectionSource): MoneyCorrectionValues => {
  const parsed = parseJson(raw);
  if (!isPlainObject(parsed)) return {};
  const entries = MONEY_CORRECTION_VALUE_KEYS[sourceType]
    .filter((key) => key in parsed)
    .map((key): [string, string | number | null | AllocationSnapshot[]] => [key, parseValue(key, parsed[key])]);
  return Object.fromEntries(entries);
};

interface RawAdjustmentLegRow {
  money_correction_id: number | string;
  leg: "hold" | "posting";
  affected_period: string;
  entry_date: string | Date;
  direction: "income" | "expense";
  payment_account_id: number | string | null;
  payment_account_name: string | null;
  amount: string | number;
}

// Junta las patas posting por cuenta y sentido (varias tiendas o meses
// afectados de una misma corrección suman en la misma cuenta).
const mergePosting = (
  postings: readonly MoneyCorrectionAdjustmentPosting[],
  row: RawAdjustmentLegRow
): MoneyCorrectionAdjustmentPosting[] => {
  const accountId = row.payment_account_id === null ? null : Number(row.payment_account_id);
  const existing = postings.find((item) => item.payment_account_id === accountId && item.direction === row.direction);
  const amountCents = (existing ? toCents(existing.amount) : 0) + toCents(row.amount);
  const posting: MoneyCorrectionAdjustmentPosting = {
    payment_account_id: accountId,
    payment_account_name: accountId === null ? "Efectivo" : (row.payment_account_name ?? "Cuenta"),
    direction: row.direction,
    amount: fromCents(amountCents),
    net_effect: fromCents(row.direction === "income" ? amountCents : -amountCents),
  };
  if (!existing) return [...postings, posting];
  return postings.map((item) => (item === existing ? posting : item));
};

/**
 * Resumen de las patas de ajuste (cierre de caja) de las correcciones
 * kind='adjustment' de una página: UNA consulta agrupada con IN sobre los ids
 * (nunca una por fila). Devuelve id de la corrección → resumen.
 */
async function loadAdjustmentSummaries(ids: number[]): Promise<Map<number, MoneyCorrectionAdjustmentSummary>> {
  if (ids.length === 0) return new Map();

  const rows = await DataBase.instance.sequelize.query<RawAdjustmentLegRow>(
    `SELECT e.money_correction_id, e.leg, e.affected_period, e.entry_date, e.direction, e.payment_account_id,
            MAX(pa.name) AS payment_account_name, SUM(e.amount) AS amount
     FROM cash_adjustment_entry e
     LEFT JOIN general_variable pa ON pa.id = e.payment_account_id
     WHERE e.money_correction_id IN (:ids)
     GROUP BY e.money_correction_id, e.leg, e.affected_period, e.entry_date, e.direction, e.payment_account_id
     ORDER BY e.money_correction_id, e.affected_period, e.payment_account_id`,
    { type: QueryTypes.SELECT, replacements: { ids } }
  );

  type PartialSummary = Pick<MoneyCorrectionAdjustmentSummary, "affected_periods" | "posted_date" | "postings">;
  const partials = new Map<number, PartialSummary>();
  for (const row of rows) {
    const id = Number(row.money_correction_id);
    const summary = partials.get(id) ?? { affected_periods: [], posted_date: null, postings: [] };
    const affectedPeriods = summary.affected_periods.includes(row.affected_period)
      ? summary.affected_periods
      : [...summary.affected_periods, row.affected_period].sort();
    if (row.leg === "hold") {
      partials.set(id, { ...summary, affected_periods: affectedPeriods });
      continue;
    }
    partials.set(id, {
      affected_periods: affectedPeriods,
      posted_date: summary.posted_date ?? toDateOnlyString(row.entry_date),
      postings: mergePosting(summary.postings, row),
    });
  }

  // Atajos para la UI ("Diferencia registrada el 12/05/2026 en BCP: −S/ 20,00").
  return new Map(
    [...partials].map(([id, summary]): [number, MoneyCorrectionAdjustmentSummary] => {
      const accountNames = [...new Set(summary.postings.map((posting) => posting.payment_account_name))];
      return [
        id,
        {
          ...summary,
          affected_period: summary.affected_periods[0] ?? null,
          net_effect: fromCents(summary.postings.reduce((total, posting) => total + toCents(posting.net_effect), 0)),
          account_name: accountNames.length === 1 ? (accountNames[0] ?? null) : null,
        },
      ];
    })
  );
}

/**
 * Historial de correcciones de UNA fila de dinero (más reciente primero),
 * paginado. NO valida alcance: el endpoint de cada módulo carga primero la
 * fila de su fuente y aplica su regla de empresa/tienda (404 si está fuera)
 * antes de llamar a esto.
 */
export async function listMoneyCorrections({
  sourceType,
  sourceId,
  page,
  limit,
}: ListMoneyCorrectionsInput): Promise<PaginatedResult<MoneyCorrectionListItem>> {
  const replacements = { sourceType, sourceId, limit, offset: (page - 1) * limit };

  const [countRow] = await DataBase.instance.sequelize.query<{ total: number | string }>(
    "SELECT COUNT(*) AS total FROM money_correction WHERE source_type = :sourceType AND source_id = :sourceId",
    { type: QueryTypes.SELECT, replacements }
  );

  const rows = await DataBase.instance.sequelize.query<RawCorrectionRow>(
    `SELECT c.id, c.source_type, c.source_id, c.kind, c.previous_values, c.new_values, c.reason, c.created_by,
            CONCAT(u.name, ' ', u.paternal_lastname) AS created_by_name, c.created_at
     FROM money_correction c
     LEFT JOIN user u ON u.id = c.created_by
     WHERE c.source_type = :sourceType AND c.source_id = :sourceId
     ORDER BY c.created_at DESC, c.id DESC
     LIMIT :limit OFFSET :offset`,
    { type: QueryTypes.SELECT, replacements }
  );

  const adjustmentIds = rows.filter((row) => row.kind === "adjustment").map((row) => Number(row.id));
  const adjustments = await loadAdjustmentSummaries(adjustmentIds);

  const data = rows.map((row): MoneyCorrectionListItem => {
    const { date, time } = utcToBusinessParts(row.created_at);
    return {
      id: Number(row.id),
      source_type: row.source_type,
      source_id: Number(row.source_id),
      kind: row.kind,
      previous_values: parseMoneyCorrectionValues(row.previous_values, row.source_type),
      new_values: parseMoneyCorrectionValues(row.new_values, row.source_type),
      reason: row.reason,
      created_by: Number(row.created_by),
      created_by_name: row.created_by_name,
      created_at: new Date(row.created_at).toISOString(),
      created_date: date,
      created_time: time,
      adjustment: row.kind === "adjustment" ? (adjustments.get(Number(row.id)) ?? null) : null,
    };
  });

  return { data, meta: buildPaginationMeta(Number(countRow?.total ?? 0), page, limit) };
}
