import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { ProductModel } from "../../../product/model/product.model";
import {
  findProductColor,
  isSameText,
  loadProductVariants,
  ProductVariants,
  variantsOf,
} from "../../../quotation/services/shared/item_variant";
import { WebQuoteItemInput, WebQuoteMissingItem } from "../../types/web_quote_request.types";
import { findProductsBySku, skuKey } from "./products_by_sku";

interface CodeMatch {
  code: string;
  color: string | null;
  product: ProductModel;
}

export interface WebCatalog {
  bySku: Map<string, ProductModel>;
  byCode: Map<string, CodeMatch>;
  variants: Map<number, ProductVariants>;
}

export interface ResolvedWebItem {
  product: ProductModel;
  code: string | null;
  color: string | null;
  quantity: number;
}

const text = (value: string | null | undefined) => value?.trim() || null;
const uniqueTexts = (values: (string | null | undefined)[]) => [
  ...new Set(values.map(text).filter((value): value is string => value !== null)),
];

// Códigos de productos activos de la empresa. El código es único en la empresa
// (índice uq_product_code_company_code): identifica un solo producto.
async function findProductsByCode(codes: string[], companyId: number, transaction: Transaction): Promise<Map<string, CodeMatch>> {
  if (codes.length === 0) return new Map();
  const rows = await DataBase.instance.product_code.findAll({
    where: { company_id: companyId, code: { [Op.in]: codes } },
    attributes: ["code", "color", "product_id"],
    transaction,
  });
  if (rows.length === 0) return new Map();

  const products = await DataBase.instance.product.findAll({
    where: { id: { [Op.in]: rows.map((row) => row.product_id) }, company_id: companyId, is_deleted: false },
    transaction,
  });
  const productById = new Map(products.map((product) => [Number(product.id), product]));

  const matches = rows.flatMap((row): [string, CodeMatch][] => {
    const product = productById.get(Number(row.product_id));
    return product ? [[skuKey(row.code), { code: row.code, color: row.color, product }]] : [];
  });
  return new Map(matches);
}

// Todo lo que hace falta para resolver el pedido, en consultas por lote.
export async function loadWebCatalog(items: WebQuoteItemInput[], companyId: number, transaction: Transaction): Promise<WebCatalog> {
  const bySku = await findProductsBySku(uniqueTexts(items.map((item) => item.sku)), companyId, transaction);
  const byCode = await findProductsByCode(uniqueTexts(items.map((item) => item.code)), companyId, transaction);
  const products = [...bySku.values(), ...[...byCode.values()].map((match) => match.product)];
  return { bySku, byCode, variants: await loadProductVariants(products.map((product) => Number(product.id))) };
}

// El color del código manda sobre el color pedido: el código es lo que eligió
// el cliente. Lo que no se pueda confirmar no frena el pedido: se guarda sin
// ese dato y se avisa al equipo.
function resolveVariant(item: WebQuoteItemInput, product: ProductModel, match: CodeMatch | undefined, variants: ProductVariants) {
  const code = text(item.code);
  const color = text(item.color);

  if (match?.color) {
    const differs = color !== null && !isSameText(color, match.color);
    const issues = differs ? [`el código ${match.code} de "${product.name}" es ${match.color}, no ${color}`] : [];
    return { code: match.code, color: match.color, issues };
  }

  const productColor = color ? findProductColor(variants, color) : null;
  const issues = [
    ...(code && !match ? [`el código ${code} no corresponde a "${product.name}"`] : []),
    ...(color && !productColor ? [`"${product.name}" no tiene el color ${color}`] : []),
  ];
  return { code: match?.code ?? null, color: productColor, issues };
}

/**
 * Convierte el carrito en items. El producto sale del SKU o, si no llegó o no
 * existe, del código. Si llegan los dos y no coinciden, se respeta el SKU sin
 * ese código. Las líneas se suman solo si son el mismo producto, código y
 * color: 100 negros + 200 azules son dos items.
 */
export function resolveWebItems(items: WebQuoteItemInput[], catalog: WebCatalog) {
  const resolved = new Map<string, ResolvedWebItem>();
  const missing = new Map<string, WebQuoteMissingItem>();
  const variantIssues = new Set<string>();

  for (const item of items) {
    const sku = text(item.sku);
    const code = text(item.code);
    const fromCode = code ? catalog.byCode.get(skuKey(code)) : undefined;
    const product = (sku ? catalog.bySku.get(skuKey(sku)) : undefined) ?? fromCode?.product;

    if (!product) {
      const key = `${skuKey(sku ?? "")}|${skuKey(code ?? "")}`;
      missing.set(key, { sku, code, quantity: (missing.get(key)?.quantity ?? 0) + item.quantity });
      continue;
    }

    const match = fromCode && Number(fromCode.product.id) === Number(product.id) ? fromCode : undefined;
    const variant = resolveVariant(item, product, match, variantsOf(catalog.variants, Number(product.id)));
    variant.issues.forEach((issue) => variantIssues.add(issue));

    const key = `${product.id}|${skuKey(variant.code ?? "")}|${skuKey(variant.color ?? "")}`;
    resolved.set(key, {
      product,
      code: variant.code,
      color: variant.color,
      quantity: (resolved.get(key)?.quantity ?? 0) + item.quantity,
    });
  }

  return { resolved: [...resolved.values()], missingItems: [...missing.values()], variantIssues: [...variantIssues] };
}
