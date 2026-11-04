import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { ProductAttributes, ProductModel } from "../../model/product.model";
import { loadColorsByProduct, ProductColorDto } from "./colors";
import { loadCodesByProduct, ProductCodeDto } from "./codes";
import { companiesWithProductImages } from "./images";

export interface CatalogRef {
  id: number;
  name: string;
}

export interface ProductDto extends ProductAttributes {
  category: CatalogRef | null;
  subcategory: CatalogRef | null;
  colors: ProductColorDto[];
  // Códigos de proveedores (el SKU va aparte, es uno solo).
  codes: ProductCodeDto[];
  // La empresa del producto tiene habilitadas las fotos: el frontend solo
  // muestra la foto (y deja subirla) cuando esto es true.
  images_enabled: boolean;
}

const uniqueIds = (values: (number | null)[]) =>
  [...new Set(values.filter((value): value is number => value !== null).map(Number))];

// Nombres de categorías/subcategorías de un lote de productos: UNA consulta.
async function loadCatalogNames(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map();
  const rows = await DataBase.instance.variable_general.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ["id", "name"],
  });
  return new Map(rows.map((row) => [Number(row.id), row.name]));
}

const toRef = (id: number | null, names: Map<number, string>): CatalogRef | null => {
  if (id === null) return null;
  const name = names.get(Number(id));
  return name === undefined ? null : { id: Number(id), name };
};

// Productos + categoría, subcategoría, colores, códigos y si su empresa
// muestra fotos, en 4 consultas para todo el lote (nunca una por producto).
export async function toProductDtos(rows: ProductModel[]): Promise<ProductDto[]> {
  const productIds = rows.map((row) => Number(row.id));
  const [names, colors, codes, withImages] = await Promise.all([
    loadCatalogNames(uniqueIds(rows.flatMap((row) => [row.category_id, row.subcategory_id]))),
    loadColorsByProduct(productIds),
    loadCodesByProduct(productIds),
    companiesWithProductImages(uniqueIds(rows.map((row) => row.company_id))),
  ]);

  return rows.map((row) => {
    const plain = row.get({ plain: true }) as ProductAttributes;
    return {
      ...plain,
      category: toRef(plain.category_id, names),
      subcategory: toRef(plain.subcategory_id, names),
      colors: colors.get(Number(plain.id)) ?? [],
      codes: codes.get(Number(plain.id)) ?? [],
      images_enabled: withImages.has(Number(plain.company_id)),
    };
  });
}
