import { AppError } from "../../../../../core/errors/AppError";
import { roundMoney } from "../../../../../utils/numbers";
import { QuotationItemDiscountType } from "../../model/quotation_item.model";

// Descuento opcional de un producto de la cotización (pedido del usuario,
// 21-nov: "descuento por % ej. 20%, y descuento directo: colocas el monto que
// quieres que quede el producto y el sistema hace ese descuento"). El monto
// directo es el PRECIO UNITARIO final (decisión del usuario).
export interface ItemDiscountInput {
  discount_type?: QuotationItemDiscountType | null;
  discount_value?: number | string | null;
}

export interface DiscountedUnitPrice {
  // Precio por unidad que se cobra (con el descuento aplicado).
  unit_price: number;
  // Precio por unidad antes del descuento; null = sin descuento.
  list_unit_price: number | null;
  discount_type: QuotationItemDiscountType | null;
  discount_value: number | null;
}

const invalidDiscount = (message: string) => new AppError(400, message, undefined, "INVALID_DISCOUNT");

/**
 * Aplica el descuento al precio unitario de lista (producto + técnica, o el
 * precio libre). Sin tipo = sin descuento. El precio final se redondea a
 * céntimos ANTES de multiplicar por la cantidad, igual que el precio sin
 * descuento (el PDF tiene que cuadrar a mano).
 */
export function applyItemDiscount(listUnitPrice: number, input: ItemDiscountInput, productName: string): DiscountedUnitPrice {
  const type = input.discount_type ?? null;
  if (!type) return { unit_price: listUnitPrice, list_unit_price: null, discount_type: null, discount_value: null };

  const value = Number(input.discount_value);
  if (!Number.isFinite(value) || value <= 0) {
    throw invalidDiscount(`Indica el descuento de "${productName}"`);
  }

  if (type === "percent") {
    if (value >= 100) throw invalidDiscount(`El descuento de "${productName}" debe ser menor a 100%`);
    const unitPrice = roundMoney(listUnitPrice * (1 - value / 100));
    if (unitPrice <= 0) throw invalidDiscount(`Con ese descuento "${productName}" quedaría en S/ 0.00`);
    return { unit_price: unitPrice, list_unit_price: listUnitPrice, discount_type: type, discount_value: roundMoney(value) };
  }

  // final_price: "que quede en S/ X" por unidad. Tiene que ser una rebaja real.
  const finalPrice = roundMoney(value);
  if (finalPrice >= listUnitPrice) {
    throw invalidDiscount(
      `El precio final de "${productName}" (S/ ${finalPrice.toFixed(2)}) debe ser menor que su precio de S/ ${listUnitPrice.toFixed(2)}`
    );
  }
  return { unit_price: finalPrice, list_unit_price: listUnitPrice, discount_type: type, discount_value: finalPrice };
}
