// Funcionalidades que se pueden contratar por empresa. Cada ítem del sprint que
// necesite una agrega su código acá (almacén, guías...).
export const FEATURE_CODES = ["supplier_stock", "inventory"] as const;
export type FeatureCode = (typeof FEATURE_CODES)[number];

export interface FeatureDefinition {
  code: FeatureCode;
  label: string;
  description: string;
}

export interface CompanyFeatureDto extends FeatureDefinition {
  enabled: boolean;
}
