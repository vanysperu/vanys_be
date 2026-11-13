import { Op, Sequelize, WhereOptions, col, fn, literal } from "sequelize";
import { DataBase } from "../../../../database";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../core/utils/paginate";
import type { SupplierStockItemAttributes } from "../model/supplier_stock.models";
import type { StockSearchRow } from "../types/supplier_stock.types";
import { normalizeCode } from "./shared/stock_parsing";
import { findProductsByNorms } from "./lookup.service";

interface SearchStockParams {
  companyId: number;
  page: number;
  limit: number;
  searchTerm?: string;
  // Solo los códigos del Excel que no están en ningún producto (para enlazarlos).
  onlyUnlinked?: boolean;
}

// Códigos del Excel sin producto: ni código de proveedor ni SKU de la empresa.
const UNLINKED = literal(`NOT EXISTS (
    SELECT 1 FROM product_code pc
    WHERE pc.company_id = supplier_stock_item.company_id AND pc.code_norm = supplier_stock_item.code_norm
  ) AND NOT EXISTS (
    SELECT 1 FROM product p
    WHERE p.company_id = supplier_stock_item.company_id AND p.sku_norm = supplier_stock_item.code_norm
  )`);

// Pantalla "Stock de proveedores" (plan §7): una fila por código, una columna
// por fuente y el total. Paginado por código en la base (CLAUDE.md §4).
export const searchStockService = async (params: SearchStockParams): Promise<PaginatedResult<StockSearchRow>> => {
  const sources = await DataBase.instance.supplier_stock_source.findAll({
    where: { company_id: params.companyId, active: true, last_import_id: { [Op.ne]: null } },
    attributes: ["id", "name", "last_import_id"],
  });
  if (sources.length === 0) return { data: [], meta: buildPaginationMeta(0, params.page, params.limit) };

  // Empresa y lecturas vigentes: base de todas las consultas de abajo.
  const scope: WhereOptions<SupplierStockItemAttributes> = {
    company_id: params.companyId,
    import_id: { [Op.in]: sources.map((source) => Number(source.last_import_id)) },
  };
  const conditions: WhereOptions<SupplierStockItemAttributes>[] = [scope];
  const term = params.searchTerm?.trim();
  if (term) {
    const norm = normalizeCode(term);
    conditions.push({
      [Op.or]: [...(norm ? [{ code_norm: { [Op.like]: `%${norm}%` } }] : []), { description: { [Op.like]: `%${term}%` } }],
    });
  }
  if (params.onlyUnlinked) conditions.push(Sequelize.where(UNLINKED, Op.eq, true) as unknown as WhereOptions<SupplierStockItemAttributes>);
  const where = { [Op.and]: conditions };

  const [total, page] = await Promise.all([
    DataBase.instance.supplier_stock_item.count({ where, distinct: true, col: "code_norm" }),
    DataBase.instance.supplier_stock_item.findAll({
      attributes: ["code_norm", [fn("MAX", col("code_raw")), "code"], [fn("MAX", col("description")), "description"]],
      where,
      group: ["code_norm"],
      order: [["code_norm", "ASC"]],
      limit: params.limit,
      offset: getOffset(params.page, params.limit),
      raw: true,
    }) as unknown as Promise<{ code_norm: string; code: string; description: string | null }[]>,
  ]);
  const sourceNames = new Map(sources.map((source) => [Number(source.id), source.name]));
  const norms = page.map((row) => row.code_norm);
  if (norms.length === 0) return { data: [], meta: buildPaginationMeta(total, params.page, params.limit) };

  const [details, products] = await Promise.all([
    DataBase.instance.supplier_stock_item.findAll({
      where: { [Op.and]: [scope, { code_norm: { [Op.in]: norms } }] },
      attributes: ["source_id", "code_norm", "quantity", "quantity_text"],
    }),
    findProductsByNorms(params.companyId, norms),
  ]);

  const data = page.map((row) => {
    const bySourceMap = new Map<number, { quantity: number | null; quantityText: string | null }>();
    for (const item of details) {
      if (item.code_norm !== row.code_norm) continue;
      const sourceId = Number(item.source_id);
      const current = bySourceMap.get(sourceId) ?? { quantity: null, quantityText: null };
      bySourceMap.set(sourceId, {
        quantity: item.quantity === null ? current.quantity : (current.quantity ?? 0) + item.quantity,
        quantityText: current.quantityText ?? item.quantity_text,
      });
    }
    const bySource = [...bySourceMap.entries()].map(([sourceId, value]) => ({ sourceId, sourceName: sourceNames.get(sourceId) ?? "", ...value }));
    return {
      code: row.code,
      description: row.description,
      products: products.get(row.code_norm) ?? [],
      bySource,
      total: bySource.reduce((sum, entry) => sum + (entry.quantity ?? 0), 0),
    };
  });
  return { data, meta: buildPaginationMeta(total, params.page, params.limit) };
};
