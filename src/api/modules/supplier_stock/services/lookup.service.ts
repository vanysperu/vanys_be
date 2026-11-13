import { Op, Sequelize } from "sequelize";
import { DataBase } from "../../../../database";
import { utcToBusinessParts } from "../../../../utils/dateUtils";
import { normalizeCode } from "./shared/stock_parsing";
import type { ProductSourceStock, ProductStockLookup } from "../types/supplier_stock.types";

// Un dato de más de un día se marca "desactualizado" en la cotización.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const MAX_LOOKUP_PRODUCTS = 100;

interface MatchKey {
  norm: string;
  // Color del producto al que corresponde el código (si está vinculado).
  color: string | null;
  // Proveedor del código: solo cruza con fuentes de ese proveedor (D6). null =
  // código sin proveedor o SKU: cruza con cualquier fuente.
  supplierId: number | null;
}

// Códigos con los que se busca cada producto: sus códigos de proveedor y su SKU.
const loadMatchKeys = async (companyId: number, productIds: number[]): Promise<Map<number, MatchKey[]>> => {
  const [codes, products] = await Promise.all([
    DataBase.instance.product_code.findAll({
      where: { company_id: companyId, product_id: { [Op.in]: productIds } },
      attributes: ["product_id", "code", "supplier_id", "color"],
    }),
    DataBase.instance.product.findAll({
      where: { company_id: companyId, id: { [Op.in]: productIds } },
      attributes: ["id", "sku"],
    }),
  ]);
  const keys = new Map<number, MatchKey[]>(products.map((product) => [Number(product.id), []]));
  for (const product of products) {
    const norm = product.sku ? normalizeCode(product.sku) : "";
    if (norm) keys.get(Number(product.id))?.push({ norm, color: null, supplierId: null });
  }
  for (const code of codes) {
    const norm = normalizeCode(code.code);
    if (!norm) continue;
    keys.get(Number(code.product_id))?.push({
      norm,
      color: code.color,
      supplierId: code.supplier_id === null ? null : Number(code.supplier_id),
    });
  }
  return keys;
};

// Stock de proveedores de varios productos en UNA llamada (plan §7, CLAUDE.md
// §8: nada de una consulta por producto). Cada fuente se muestra por separado
// y además la suma (pedido explícito del usuario: "no combinados").
export const lookupProductStockService = async (companyId: number, productIds: number[]): Promise<ProductStockLookup[]> => {
  const ids = [...new Set(productIds)].slice(0, MAX_LOOKUP_PRODUCTS);
  if (ids.length === 0) return [];

  const [keysByProduct, sources] = await Promise.all([
    loadMatchKeys(companyId, ids),
    DataBase.instance.supplier_stock_source.findAll({
      where: { company_id: companyId, active: true, last_import_id: { [Op.ne]: null } },
      attributes: ["id", "name", "supplier_id", "last_import_id", "last_success_at"],
      order: [["name", "ASC"]],
    }),
  ]);
  const norms = [...new Set([...keysByProduct.values()].flat().map((key) => key.norm))];
  if (sources.length === 0 || norms.length === 0) return ids.map((productId) => ({ productId, sources: [], total: 0 }));

  const [items, suppliers] = await Promise.all([
    DataBase.instance.supplier_stock_item.findAll({
      where: {
        company_id: companyId,
        import_id: { [Op.in]: sources.map((source) => Number(source.last_import_id)) },
        code_norm: { [Op.in]: norms },
      },
      attributes: ["id", "source_id", "code_norm", "color", "quantity", "quantity_text"],
    }),
    DataBase.instance.supplier.findAll({
      where: { id: { [Op.in]: [...new Set(sources.map((source) => Number(source.supplier_id)))] } },
      attributes: ["id", "name"],
    }),
  ]);
  const supplierNames = new Map(suppliers.map((supplier) => [Number(supplier.id), supplier.name]));
  const itemsByKey = new Map<string, typeof items>();
  for (const item of items) {
    const key = `${item.source_id}|${item.code_norm}`;
    itemsByKey.set(key, [...(itemsByKey.get(key) ?? []), item]);
  }

  return ids.map((productId) => {
    const keys = keysByProduct.get(productId) ?? [];
    const perSource = sources.flatMap((source): ProductSourceStock[] => {
      const sourceId = Number(source.id);
      const supplierId = Number(source.supplier_id);
      const seen = new Set<number>();
      const byColor = new Map<string, number>();
      const quantityTexts: string[] = [];
      let quantity = 0;
      for (const key of keys) {
        if (key.supplierId !== null && key.supplierId !== supplierId) continue;
        for (const item of itemsByKey.get(`${sourceId}|${key.norm}`) ?? []) {
          if (seen.has(Number(item.id))) continue;
          seen.add(Number(item.id));
          if (item.quantity === null) {
            if (item.quantity_text) quantityTexts.push(item.quantity_text);
            continue;
          }
          quantity += item.quantity;
          const color = key.color ?? item.color;
          if (color) byColor.set(color, (byColor.get(color) ?? 0) + item.quantity);
        }
      }
      if (seen.size === 0) return [];
      const lastSuccess = source.last_success_at ? new Date(source.last_success_at) : null;
      return [
        {
          sourceId,
          sourceName: source.name,
          supplierName: supplierNames.get(supplierId) ?? null,
          quantity,
          quantityTexts: [...new Set(quantityTexts)],
          byColor: [...byColor.entries()].map(([color, colorQuantity]) => ({ color, quantity: colorQuantity })),
          updatedAt: lastSuccess ? utcToBusinessParts(lastSuccess) : null,
          stale: !lastSuccess || Date.now() - lastSuccess.getTime() > STALE_AFTER_MS,
        },
      ];
    });
    return { productId, sources: perSource, total: perSource.reduce((sum, entry) => sum + entry.quantity, 0) };
  });
};

// Para la búsqueda: productos de la empresa cuyo código o SKU normalizado está
// en la lista (columnas generadas e indexadas, migración 20261114110100).
export const findProductsByNorms = async (companyId: number, norms: string[]): Promise<Map<string, { id: number; name: string }[]>> => {
  const byNorm = new Map<string, { id: number; name: string }[]>();
  if (norms.length === 0) return byNorm;
  const add = (norm: string, product: { id: number; name: string }) => {
    const list = byNorm.get(norm) ?? [];
    if (!list.some((entry) => entry.id === product.id)) list.push(product);
    byNorm.set(norm, list);
  };

  const [codes, products] = await Promise.all([
    DataBase.instance.product_code.findAll({
      where: { [Op.and]: [{ company_id: companyId }, Sequelize.where(Sequelize.col("code_norm"), { [Op.in]: norms })] },
      attributes: ["product_id", "code"],
    }),
    DataBase.instance.product.findAll({
      where: { [Op.and]: [{ company_id: companyId }, Sequelize.where(Sequelize.col("sku_norm"), { [Op.in]: norms })] },
      attributes: ["id", "name", "sku"],
    }),
  ]);
  const productIds = [...new Set(codes.map((code) => Number(code.product_id)))];
  const owners = productIds.length
    ? await DataBase.instance.product.findAll({ where: { id: { [Op.in]: productIds } }, attributes: ["id", "name"] })
    : [];
  const ownerById = new Map(owners.map((owner) => [Number(owner.id), { id: Number(owner.id), name: owner.name }]));
  for (const code of codes) {
    const owner = ownerById.get(Number(code.product_id));
    if (owner) add(normalizeCode(code.code), owner);
  }
  for (const product of products) {
    if (product.sku) add(normalizeCode(product.sku), { id: Number(product.id), name: product.name });
  }
  return byNorm;
};
