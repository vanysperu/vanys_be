import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";
import { RecordMoneyCorrectionInput } from "../../types/money_correction.types";

// Mismo rango que la columna (VARCHAR(500)) y el CHECK de la base (>= 5).
const MIN_REASON_LENGTH = 5;
const MAX_REASON_LENGTH = 500;

/**
 * Inserta la fila inmutable del historial de una corrección de dinero. La
 * llama el service de corrección de cada fuente, DENTRO de su transacción y
 * después de aplicar el cambio: si cualquier paso falla, no queda ni el
 * cambio ni el historial.
 *
 * `previous`/`next` llevan solo lo que cambió (más fotos derivadas). El
 * motivo se vuelve a validar acá (el validator ya lo revisó) para que ningún
 * caller pueda guardar una corrección sin explicación.
 */
export async function recordMoneyCorrection({
  sourceType,
  sourceId,
  companyId,
  businessUnitId,
  previous,
  next,
  reason,
  actorId,
  kind = "correction",
  transaction,
}: RecordMoneyCorrectionInput): Promise<{ id: number }> {
  const trimmedReason = reason.trim();
  // Caracteres reales, no unidades UTF-16 (igual que CHAR_LENGTH de la base).
  const reasonLength = [...trimmedReason].length;
  if (reasonLength < MIN_REASON_LENGTH || reasonLength > MAX_REASON_LENGTH) {
    throw new AppError(400, "El motivo de la corrección debe tener entre 5 y 500 caracteres", undefined, "INVALID_REASON");
  }

  const now = nowUtc();
  const correction = await DataBase.instance.money_correction.create(
    {
      id: 0,
      company_id: companyId,
      business_unit_id: businessUnitId,
      source_type: sourceType,
      source_id: sourceId,
      kind,
      previous_values: previous,
      new_values: next,
      reason: trimmedReason,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    },
    { transaction }
  );

  return { id: correction.id };
}
