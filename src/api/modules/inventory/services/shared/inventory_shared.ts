import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { hasCompanyFeature } from "../../../company_feature/services/shared/feature_store";
import type { DocType, WarehouseModel } from "../../model/inventory.models";

// El Super Administrador pasa el middleware de funcionalidad: acá se valida
// que la empresa elegida tenga el inventario.
export const assertCompanyHasInventory = async (companyId: number): Promise<void> => {
  if (await hasCompanyFeature(companyId, "inventory")) return;
  throw new AppError(403, "La empresa no tiene habilitado el inventario", undefined, "FEATURE_DISABLED");
};

// Alcance por tienda (CLAUDE.md §11.1): un usuario atado a una tienda opera
// solo los almacenes de su tienda; el permiso de "ver todas las tiendas" amplía
// la LECTURA, nunca la escritura.
export const canReadWarehouse = (user: IToken, warehouse: Pick<WarehouseModel, "company_id" | "business_unit_id" | "is_transit">) => {
  if (user.isSystem) return true;
  if (Number(warehouse.company_id) !== user.companyId) return false;
  if (!user.businessUnitId || user.canViewAllBusinessUnits || warehouse.is_transit) return true;
  return Number(warehouse.business_unit_id) === user.businessUnitId;
};

export const canWriteWarehouse = (user: IToken, warehouse: Pick<WarehouseModel, "company_id" | "business_unit_id">) => {
  if (user.isSystem) return true;
  if (Number(warehouse.company_id) !== user.companyId) return false;
  if (!user.businessUnitId) return true;
  return Number(warehouse.business_unit_id) === user.businessUnitId;
};

// Almacén para leer o escribir; uno ajeno responde 404 (no se revela que existe).
export const findWarehouseForCaller = async (
  id: number,
  user: IToken,
  mode: "read" | "write",
  transaction?: Transaction
): Promise<WarehouseModel> => {
  const warehouse = await DataBase.instance.warehouse.findByPk(id, { transaction });
  if (!warehouse || warehouse.is_transit) throw new AppError(404, "El almacén no existe");
  const allowed = mode === "read" ? canReadWarehouse(user, warehouse) : canWriteWarehouse(user, warehouse);
  if (!allowed) throw new AppError(404, "El almacén no existe");
  return warehouse;
};

// Almacén virtual "En tránsito" de la empresa (una transferencia despachada
// y no recibida vive acá). Se crea la primera vez que hace falta.
export const getTransitWarehouse = async (companyId: number, actorId: number | null, transaction: Transaction): Promise<WarehouseModel> => {
  const existing = await DataBase.instance.warehouse.findOne({ where: { company_id: companyId, is_transit: true }, transaction });
  if (existing) return existing;
  const now = new Date();
  await DataBase.instance.sequelize.query(
    `INSERT IGNORE INTO warehouse (company_id, business_unit_id, code, name, allow_negative_stock, track_lots, track_expiry,
       expiry_alert_days, block_expired, is_default, is_transit, active, created_by, created_at, updated_by, updated_at)
     VALUES (?, NULL, 'TRANSITO', 'En tránsito', FALSE, FALSE, FALSE, 30, FALSE, FALSE, TRUE, TRUE, ?, ?, ?, ?)`,
    { replacements: [companyId, actorId, now, actorId, now], transaction }
  );
  const created = await DataBase.instance.warehouse.findOne({ where: { company_id: companyId, is_transit: true }, transaction });
  if (!created) throw new AppError(500, "No se pudo crear el almacén de tránsito");
  return created;
};

// Serie por tipo de documento (plan §3.4): NI = ingreso, NS = salida,
// TR = transferencia, AJ = ajuste.
const SERIES_BY_TYPE: Record<DocType, string> = { entry: "NI01", exit: "NS01", transfer: "TR01", adjustment: "AJ01" };

// Número correlativo sin saltos ni duplicados: la fila de la serie se bloquea
// (SELECT ... FOR UPDATE) dentro de la transacción del documento.
export const nextDocumentNumber = async (
  companyId: number,
  docType: DocType,
  actorId: number | null,
  transaction: Transaction
): Promise<{ series: string; number: number }> => {
  const series = SERIES_BY_TYPE[docType];
  const now = new Date();
  await DataBase.instance.sequelize.query(
    `INSERT IGNORE INTO document_series (company_id, document_type, series, next_number, created_by, created_at, updated_by, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?)`,
    { replacements: [companyId, `stock_${docType}`, series, actorId, now, actorId, now], transaction }
  );
  const row = await DataBase.instance.document_series.findOne({
    where: { company_id: companyId, document_type: `stock_${docType}`, series },
    lock: transaction.LOCK.UPDATE,
    transaction,
  });
  if (!row) throw new AppError(500, "No se pudo numerar el documento");
  const number = row.next_number;
  await row.update({ next_number: number + 1, updated_by: actorId, updated_at: now }, { transaction });
  return { series, number };
};

// Clave de color en el stock: el nombre tal cual del producto ('' = sin color).
export const colorKeyOf = (color: string | null | undefined): string => color?.trim() ?? "";
