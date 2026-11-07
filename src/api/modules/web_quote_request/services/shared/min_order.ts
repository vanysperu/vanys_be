import { ProductModel } from "../../../product/model/product.model";
import { ResolvedWebItem } from "./resolve_items";

// Pedido mínimo de un producto (null = sin mínimo). La columna es INTEGER, pero
// se normaliza por si el driver la entrega como texto.
export const minOrderOf = (product: ProductModel): number | null =>
  product.min_order_quantity === null || product.min_order_quantity === undefined ? null : Number(product.min_order_quantity);

// Por debajo del mínimo: se recibe igual y queda marcado (decisión del usuario).
export const isBelowMinOrder = (product: ProductModel, quantity: number): boolean => {
  const minimum = minOrderOf(product);
  return minimum !== null && quantity < minimum;
};

// "TAZA-01 Taza mágica (se pidieron 50, mínimo 100)", para avisos e Historial.
export const describeBelowMinimum = (item: ResolvedWebItem): string => {
  const label = [item.product.sku, item.product.name].filter(Boolean).join(" ");
  return `${label} (se pidieron ${item.quantity}, mínimo ${minOrderOf(item.product) ?? 0})`;
};
