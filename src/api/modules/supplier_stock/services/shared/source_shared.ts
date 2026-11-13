import { Op, Transaction, fn, col } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { openSecret } from "../../../../../core/security/secretBox";
import { utcToBusinessParts } from "../../../../../utils/dateUtils";
import { hasCompanyFeature } from "../../../company_feature/services/shared/feature_store";
import type { SupplierStockSourceModel } from "../../model/supplier_stock.models";
import type { StockSourceDto } from "../../types/supplier_stock.types";

const notFound = () => new AppError(404, "La fuente de stock no existe");

// Fuente de la empresa del usuario (o de cualquiera si es Super
// Administrador). Una de otra empresa responde 404.
export const findSourceForCaller = async (id: number, user: IToken, transaction?: Transaction): Promise<SupplierStockSourceModel> => {
  const source = await DataBase.instance.supplier_stock_source.findByPk(id, { transaction });
  if (!source) throw notFound();
  if (!user.isSystem && Number(source.company_id) !== user.companyId) throw notFound();
  return source;
};

// El Super Administrador pasa el middleware de funcionalidad: acá se valida
// que la empresa elegida la tenga.
export const assertCompanyHasStockFeature = async (companyId: number): Promise<void> => {
  if (await hasCompanyFeature(companyId, "supplier_stock")) return;
  throw new AppError(403, "La empresa no tiene habilitado el stock de proveedores", undefined, "FEATURE_DISABLED");
};

// El proveedor tiene que ser de la misma empresa que la fuente.
export const assertSupplierInCompany = async (supplierId: number, companyId: number, transaction?: Transaction): Promise<void> => {
  const supplier = await DataBase.instance.supplier.findOne({ where: { id: supplierId, company_id: companyId }, attributes: ["id"], transaction });
  if (!supplier) throw new AppError(400, "El proveedor no existe en esta empresa", undefined, "SUPPLIER_NOT_FOUND");
};

const hostOf = (sealed: string | null): string | null => {
  if (!sealed) return null;
  try {
    return new URL(openSecret(sealed)).hostname;
  } catch {
    return null;
  }
};

// Filas vigentes por fuente, en una sola consulta.
const countCurrentItems = async (sources: SupplierStockSourceModel[]): Promise<Map<number, number>> => {
  const importIds = sources.flatMap((source) => (source.last_import_id ? [Number(source.last_import_id)] : []));
  if (importIds.length === 0) return new Map();
  const rows = (await DataBase.instance.supplier_stock_item.findAll({
    attributes: ["source_id", [fn("COUNT", col("id")), "total"]],
    where: { import_id: { [Op.in]: importIds } },
    group: ["source_id"],
    raw: true,
  })) as unknown as { source_id: number; total: number | string }[];
  return new Map(rows.map((row) => [Number(row.source_id), Number(row.total)]));
};

const loadSupplierNames = async (sources: SupplierStockSourceModel[]): Promise<Map<number, string>> => {
  const ids = [...new Set(sources.map((source) => Number(source.supplier_id)))];
  if (ids.length === 0) return new Map();
  const rows = await DataBase.instance.supplier.findAll({ where: { id: { [Op.in]: ids } }, attributes: ["id", "name"] });
  return new Map(rows.map((row) => [Number(row.id), row.name]));
};

export const toSourceDtos = async (sources: SupplierStockSourceModel[]): Promise<StockSourceDto[]> => {
  const [counts, suppliers] = await Promise.all([countCurrentItems(sources), loadSupplierNames(sources)]);
  return sources.map((source) => ({
    id: Number(source.id),
    company_id: Number(source.company_id),
    supplier_id: Number(source.supplier_id),
    supplierName: suppliers.get(Number(source.supplier_id)) ?? null,
    name: source.name,
    source_type: source.source_type,
    hasUrl: Boolean(source.url_encrypted),
    urlHost: hostOf(source.url_encrypted),
    sheet_name: source.sheet_name,
    header_row: source.header_row,
    column_map: source.column_map,
    refresh_minutes: source.refresh_minutes,
    last_status: source.last_status,
    last_error: source.last_error,
    lastSuccessAt: source.last_success_at ? utcToBusinessParts(source.last_success_at) : null,
    itemCount: counts.get(Number(source.id)) ?? 0,
    active: Boolean(source.active),
  }));
};
