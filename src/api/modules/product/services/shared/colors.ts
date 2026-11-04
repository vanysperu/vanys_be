import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";

export const MAX_PRODUCT_COLORS = 30;
export const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export interface ProductColorInput {
  name: string;
  hex?: string | null;
}

export interface ProductColorDto {
  name: string;
  hex: string | null;
}

// Nombres sin espacios sobrantes, sin repetir (sin distinguir mayúsculas) y
// con el hex en mayúsculas. El orden es el que llegó.
export const normalizeColors = (colors: ProductColorInput[]): ProductColorDto[] => {
  const seen = new Set<string>();
  return colors.flatMap((color) => {
    const name = color.name.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return [];
    seen.add(key);
    return [{ name, hex: color.hex ? color.hex.toUpperCase() : null }];
  });
};

// Reemplaza el conjunto completo de colores del producto (es su detalle: se
// manda la lista entera, en orden). Va dentro de la transacción del llamador.
export async function replaceProductColors({
  productId,
  companyId,
  colors,
  actorId,
  transaction,
}: {
  productId: number;
  companyId: number;
  colors: ProductColorInput[];
  actorId: number | null;
  transaction: Transaction;
}): Promise<void> {
  await DataBase.instance.product_color.destroy({ where: { product_id: productId }, transaction });
  const normalized = normalizeColors(colors);
  if (normalized.length === 0) return;

  const now = nowUtc();
  await DataBase.instance.product_color.bulkCreate(
    normalized.map((color, index) => ({
      id: 0,
      company_id: companyId,
      product_id: productId,
      name: color.name,
      hex_code: color.hex,
      position: index,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    })),
    { transaction }
  );
}

// Colores de varios productos en UNA consulta (sin N+1 en los listados).
export async function loadColorsByProduct(productIds: number[]): Promise<Map<number, ProductColorDto[]>> {
  const byProduct = new Map<number, ProductColorDto[]>();
  if (productIds.length === 0) return byProduct;

  const rows = await DataBase.instance.product_color.findAll({
    where: { product_id: { [Op.in]: productIds } },
    attributes: ["product_id", "name", "hex_code"],
    order: [
      ["product_id", "ASC"],
      ["position", "ASC"],
    ],
  });
  for (const row of rows) {
    const productId = Number(row.product_id);
    const list = byProduct.get(productId) ?? [];
    list.push({ name: row.name, hex: row.hex_code });
    byProduct.set(productId, list);
  }
  return byProduct;
}
