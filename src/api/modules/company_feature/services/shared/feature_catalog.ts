import type { FeatureCode, FeatureDefinition } from "../../types/company_feature.types";

// Lo que ve el Super Administrador en Empresas → Funcionalidades.
export const FEATURE_CATALOG: readonly FeatureDefinition[] = [
  {
    code: "supplier_stock",
    label: "Stock de proveedores",
    description: "Lee los Excel de stock de las importadoras y muestra cuánto tiene cada una al cotizar.",
  },
  {
    code: "inventory",
    label: "Almacenes e inventario",
    description: "Almacenes por tienda, ingresos, salidas, transferencias, lotes y kardex.",
  },
];

export const isFeatureCode = (value: string): value is FeatureCode =>
  FEATURE_CATALOG.some((feature) => feature.code === value);
