import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { ProductAttributes, ProductModel } from "../../model/product.model";
import { loadColorsByProduct, ProductColorDto } from "./colors";
import { loadCodesByProduct, ProductCodeDto } from "./codes";

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
  // Nombre de la empresa: el Super Administrador ve productos de todas.
  company_name: string | null;
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

// Nombre y si muestra fotos, de cada empresa del lote: UNA consulta.
async function loadCompanies(ids: number[]) {
  if (ids.length === 0) return new Map<number, { name: string; imagesEnabled: boolean }>();
  const rows = await DataBase.instance.company.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ["id", "business_name", "product_images_enabled"],
  });
  return new Map(
    rows.map((row) => [Number(row.id), { name: row.business_name, imagesEnabled: Boolean(row.product_images_enabled) }])
  );
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
  const [names, colors, codes, companies] = await Promise.all([
    loadCatalogNames(uniqueIds(rows.flatMap((row) => [row.category_id, row.subcategory_id]))),
    loadColorsByProduct(productIds),
    loadCodesByProduct(productIds),
    loadCompanies(uniqueIds(rows.map((row) => row.company_id))),
  ]);

  return rows.map((row) => {
    const plain = row.get({ plain: true }) as ProductAttributes;
    const company = companies.get(Number(plain.company_id));
    return {
      ...plain,
      category: toRef(plain.category_id, names),
      subcategory: toRef(plain.subcategory_id, names),
      colors: colors.get(Number(plain.id)) ?? [],
      codes: codes.get(Number(plain.id)) ?? [],
      images_enabled: company?.imagesEnabled ?? false,
      company_name: company?.name ?? null,
    };
  });
}
