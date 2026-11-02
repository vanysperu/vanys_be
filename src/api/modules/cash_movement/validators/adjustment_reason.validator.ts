import { body, ValidationChain } from "express-validator";

// Motivo OPCIONAL de un anular/restaurar (toggle) de cualquier fuente de Caja.
// Solo se exige cuando la fila es de un mes CERRADO y el cambio se registra
// como ajuste: eso lo decide el service con la fila bloqueada (sin motivo →
// 400 ADJUSTMENT_REASON_REQUIRED). Si viene, mismas reglas que el motivo de
// una corrección (5 a 500 caracteres reales, como el CHECK de money_correction).
export const optionalAdjustmentReasonRule = (field = "reason"): ValidationChain =>
  body(field)
    .optional({ values: "falsy" })
    .isString()
    .withMessage("El motivo del ajuste no es válido")
    .bail()
    .trim()
    .custom((value: string) => [...value].length >= 5 && [...value].length <= 500)
    .withMessage("El motivo del ajuste debe tener entre 5 y 500 caracteres");

// Motivo del body de un toggle, ya recortado; vacío o ausente = sin motivo.
export const toggleReasonOf = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};
