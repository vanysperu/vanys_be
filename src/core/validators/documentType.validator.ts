// Reglas EXACTAS por tipo de documento — mismo catálogo global que
// `general_variable` (category="document_type", ver seeder
// 20260916180100-seed-document-types.js): los códigos acá deben coincidir
// exactamente con los `prefix_id` sembrados ahí.
//
// Compartido entre usuarios y clientes (antes vivía duplicado solo en
// users/validators/user.validator.ts) — cualquier módulo nuevo que pida un
// documento de identidad reutiliza esto en vez de reinventar el switch.
export const DOCUMENT_TYPE_DNI = 1;
export const DOCUMENT_TYPE_PASSPORT = 2;
export const DOCUMENT_TYPE_CE = 3;
export const DOCUMENT_TYPE_RUC = 6;

export interface DocumentTypeRule {
  // Exacto cuando min === max (DNI/RUC); rango cuando difieren (CE/PAS,
  // documentos extranjeros cuyo largo real varía por país).
  min: number;
  max: number;
  onlyDigits: boolean;
  label: string;
}

export const DOCUMENT_TYPE_RULES: Record<number, DocumentTypeRule> = {
  [DOCUMENT_TYPE_DNI]: { min: 8, max: 8, onlyDigits: true, label: "El DNI debe tener 8 dígitos." },
  [DOCUMENT_TYPE_RUC]: { min: 11, max: 11, onlyDigits: true, label: "El RUC debe tener 11 dígitos." },
  [DOCUMENT_TYPE_CE]: { min: 9, max: 12, onlyDigits: false, label: "El CE debe tener entre 9 y 12 dígitos." },
  [DOCUMENT_TYPE_PASSPORT]: { min: 6, max: 9, onlyDigits: false, label: "El pasaporte debe tener entre 6 y 9 dígitos." },
};

// Lanza un Error (mensaje amigable) si el número de documento no cumple el
// largo/formato exacto de su tipo. DNI (1) y RUC (6) son siempre numéricos;
// CE (3) y PAS (2) pueden traer letras (documentos de extranjería), así que
// no se restringen a solo dígitos.
export function assertDocumentNumberMatchesType(documentType: number, documentNumber: string): void {
  const rule = DOCUMENT_TYPE_RULES[documentType];
  if (!rule) throw new Error("El tipo de documento no es válido.");

  if (documentNumber.length < rule.min || documentNumber.length > rule.max) {
    throw new Error(rule.label);
  }
  if (rule.onlyDigits && !/^\d+$/.test(documentNumber)) {
    throw new Error("El DNI/RUC debe contener solo dígitos.");
  }
}
