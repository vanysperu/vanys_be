import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { ProductModel } from "../../../product/model/product.model";

// Clave de búsqueda del SKU: MySQL compara sin distinguir mayúsculas, así
// que el mapa en memoria tampoco ("abc-1" de la web = "ABC-1" del catálogo).
export const skuKey = (sku: string) => sku.trim().toUpperCase();

// Productos activos de la empresa cuyo SKU está entre los pedidos. Si dos
// productos comparten SKU, se queda el más antiguo (mismo criterio estable).
export async function findProductsBySku(
  skus: string[],
  companyId: number,
  transaction: Transaction
): Promise<Map<string, ProductModel>> {
  if (skus.length === 0) return new Map();
  const products = await DataBase.instance.product.findAll({
    where: { company_id: companyId, is_deleted: false, sku: { [Op.in]: skus } },
    order: [["id", "ASC"]],
    transaction,
  });

  const bySku = new Map<string, ProductModel>();
  for (const product of products) {
    const key = skuKey(product.sku ?? "");
    if (!bySku.has(key)) bySku.set(key, product);
  }
  return bySku;
}
