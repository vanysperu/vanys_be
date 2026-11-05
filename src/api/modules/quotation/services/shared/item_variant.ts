import { AppError } from "../../../../../core/errors/AppError";
import { loadCodesByProduct, ProductCodeDto } from "../../../product/services/shared/codes";
import { loadColorsByProduct, ProductColorDto } from "../../../product/services/shared/colors";

export interface ProductVariants {
  colors: ProductColorDto[];
  codes: ProductCodeDto[];
}

// Lo que un item de cotización guarda de la variante elegida.
export interface ItemVariant {
  product_code: string | null;
  color: string | null;
}

const NO_VARIANTS: ProductVariants = { colors: [], codes: [] };

export const isSameText = (left: string | null | undefined, right: string | null | undefined): boolean =>
  Boolean(left) && left?.trim().toUpperCase() === right?.trim().toUpperCase();

// Colores y códigos de varios productos: 2 consultas, sin N+1.
export async function loadProductVariants(productIds: number[]): Promise<Map<number, ProductVariants>> {
  const ids = [...new Set(productIds)];
  const [colors, codes] = await Promise.all([loadColorsByProduct(ids), loadCodesByProduct(ids)]);
  return new Map(ids.map((id) => [id, { colors: colors.get(id) ?? [], codes: codes.get(id) ?? [] }]));
}

export const variantsOf = (variants: Map<number, ProductVariants>, productId: number): ProductVariants =>
  variants.get(productId) ?? NO_VARIANTS;

// Nombre del color tal como está guardado en el producto (null si no lo tiene).
export const findProductColor = (variants: ProductVariants, color: string): string | null =>
  variants.colors.find((entry) => isSameText(entry.name, color))?.name ?? null;

/**
 * Variante de un item que guarda el equipo (crear o completar una cotización):
 * - sin color: se conserva el código y su color vinculado, si tiene;
 * - con color: tiene que ser del producto y manda sobre el código. Si el código
 *   es de otro color, se toma el primero vinculado al color elegido.
 * Un código que el producto ya no tiene se descarta: el formulario no lo
 * muestra como campo y no debe frenar el guardado.
 */
export function resolveItemVariant({
  productName,
  requestedCode,
  requestedColor,
  variants,
}: {
  productName: string;
  requestedCode: string | null | undefined;
  requestedColor: string | null | undefined;
  variants: ProductVariants;
}): ItemVariant {
  const code = requestedCode?.trim() || null;
  const color = requestedColor?.trim() || null;
  const current = code ? variants.codes.find((entry) => isSameText(entry.code, code)) : undefined;
  if (!color) return { product_code: current?.code ?? null, color: current?.color ?? null };

  const productColor = findProductColor(variants, color);
  if (!productColor) {
    throw new AppError(400, `El producto "${productName}" no tiene el color "${color}"`, undefined, "QUOTATION_ITEM_COLOR_NOT_FOUND");
  }
  if (current && (!current.color || isSameText(current.color, productColor))) {
    return { product_code: current.code, color: productColor };
  }
  const linked = variants.codes.find((entry) => isSameText(entry.color, productColor));
  return { product_code: linked?.code ?? null, color: productColor };
}
