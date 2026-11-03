import { roundMoney } from "../../../../../utils/numbers";
import { ProductModel } from "../../../product/model/product.model";
import { QuotationItemPricingMode } from "../../../quotation/model/quotation_item.model";

type CatalogPricingMode = Exclude<QuotationItemPricingMode, "custom">;

// Tarifas de catálogo de mayor a menor volumen, con la cantidad mínima a
// partir de la cual se sugiere cada una.
const TIERS: { mode: CatalogPricingMode; field: keyof ProductModel; minQuantity: number }[] = [
  { mode: "thousand", field: "price_thousand", minQuantity: 1000 },
  { mode: "half_thousand", field: "price_half_thousand", minQuantity: 500 },
  { mode: "hundred", field: "price_hundred", minQuantity: 100 },
  { mode: "unit", field: "price_unit", minQuantity: 1 },
];

export interface DraftItemPricing {
  pricing_mode: CatalogPricingMode;
  unit_price: number;
  subtotal: number;
}

const tierPrice = (product: ProductModel, field: keyof ProductModel): number | null => {
  const value = product[field];
  if (value === null || value === undefined) return null;
  return Number(value);
};

// Precio SUGERIDO de un item que llega desde la web: es solo un borrador, el
// equipo lo revisa y lo completa (técnica, modo) antes de pasarla a
// Pendiente. Se toma la tarifa de mayor volumen que alcanza la cantidad
// pedida (ej. 600 unidades -> medio millar); si el producto no tiene esa
// tarifa cargada, la siguiente más chica que sí tenga, y si no alcanza
// ninguna, la de menor volumen disponible. Sin ningún precio cargado, el
// item queda en 0 y la cotización no puede pasar a Pendiente hasta
// completarlo. La técnica no se suma: la web no la elige.
export const suggestDraftPricing = (product: ProductModel, quantity: number): DraftItemPricing => {
  const priced = TIERS.map((tier) => ({ ...tier, price: tierPrice(product, tier.field) })).filter(
    (tier): tier is typeof tier & { price: number } => tier.price !== null
  );
  const chosen = priced.find((tier) => quantity >= tier.minQuantity) ?? priced[priced.length - 1];
  if (!chosen) return { pricing_mode: "unit", unit_price: 0, subtotal: 0 };

  const unitPrice = roundMoney(chosen.price);
  return { pricing_mode: chosen.mode, unit_price: unitPrice, subtotal: roundMoney(unitPrice * quantity) };
};
