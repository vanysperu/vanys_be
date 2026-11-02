import { AppError } from "../../../../../core/errors/AppError";
import { fromCents, toCents } from "../../../../../core/utils/money";

// Utilidades genéricas para comparar "antes/después" de una corrección sin
// falsos cambios (10 vs "10.00", "" vs null, Date vs "YYYY-MM-DD"). Cada
// fuente arma su foto con valores ya normalizados y usa estas funciones para
// saber qué cambió y qué guardar en el historial.

export type SnapshotValue = string | number | null;

export type CorrectionSnapshot<K extends string> = Record<K, SnapshotValue>;

// "" / null / undefined → null; cualquier otro valor → número.
export const toNullableId = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  return Number(value);
};

// Texto recortado; vacío → null.
export const toNullableText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

// Monto normalizado a 2 decimales exactos (vía céntimos enteros).
export const toMoneyValue = (value: number | string): number => fromCents(toCents(value));

// Foto pedida: la actual pisada SOLO por lo que vino definido (`undefined` =
// el campo se queda como está; `null` = se limpia). Los valores de
// `requested` ya tienen que venir normalizados por el caller.
export function applyRequested<S extends CorrectionSnapshot<string>>(
  current: S,
  requested: { [P in keyof S]?: S[P] | undefined }
): S {
  const overrides = Object.fromEntries(Object.entries(requested).filter(([, value]) => value !== undefined));
  return { ...current, ...overrides };
}

// Campos (en el orden de `fields`) cuyo valor difiere entre las dos fotos.
export function changedFieldsBetween<K extends string>(
  fields: readonly K[],
  before: CorrectionSnapshot<K>,
  after: CorrectionSnapshot<K>
): K[] {
  return fields.filter((field) => before[field] !== after[field]);
}

// Solo los campos indicados de una foto (lo que cambió), listo para el
// historial o para el UPDATE.
export function pickFields<K extends string>(
  snapshot: CorrectionSnapshot<K>,
  fields: readonly K[]
): Partial<CorrectionSnapshot<K>> {
  return fields.reduce<Partial<CorrectionSnapshot<K>>>(
    (picked, field) => ({ ...picked, [field]: snapshot[field] }),
    {}
  );
}

// Sin cambios no hay corrección: 400 con código estable (mismo contrato en
// todas las fuentes).
export function assertHasChanges(changed: readonly string[]): void {
  if (changed.length > 0) return;
  throw new AppError(400, "No hay cambios para guardar", undefined, "NO_CHANGES");
}
