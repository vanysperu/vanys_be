import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { hasRouteAccess } from "../../../../../middlewares/user-access";
import { utcToBusinessParts } from "../../../../../utils/dateUtils";
import type { StockDocumentModel, WarehouseModel } from "../../model/inventory.models";
import type { DocumentDto, DocumentInput, DocumentLineInput } from "../../types/inventory.types";
import { REASONS } from "../../types/inventory.types";
import { canReadWarehouse, canWriteWarehouse, colorKeyOf } from "../shared/inventory_shared";
import { normalizeDocumentLines } from "../shared/document_lines";
import { round3 } from "../shared/stock_engine";

// "Ver costos" (plan §8.5): un recurso RBAC sin pantalla propia.
export const COSTS_ROUTE = "/inventory/costs";
export const canSeeCosts = (user: IToken) => user.isSystem || hasRouteAccess(user, COSTS_ROUTE, "GET");

export const documentNumberText = (document: Pick<StockDocumentModel, "series" | "number">) =>
  `${document.series}-${String(document.number).padStart(6, "0")}`;

// Documento para leer (cualquiera de sus almacenes es visible) o para operar
// (escritura sobre el almacén que corresponde a la acción). Se bloquea con
// FOR UPDATE si va en una transacción que lo modifica.
export const loadDocumentForCaller = async (
  id: number,
  user: IToken,
  transaction?: Transaction
): Promise<{ document: StockDocumentModel; warehouse: WarehouseModel; target: WarehouseModel | null }> => {
  const document = await DataBase.instance.stock_document.findByPk(id, {
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!document) throw new AppError(404, "El documento no existe");
  const [warehouse, target] = await Promise.all([
    DataBase.instance.warehouse.findByPk(document.warehouse_id, { transaction }),
    document.target_warehouse_id ? DataBase.instance.warehouse.findByPk(document.target_warehouse_id, { transaction }) : Promise.resolve(null),
  ]);
  if (!warehouse) throw new AppError(404, "El documento no existe");
  const visible = canReadWarehouse(user, warehouse) || (target !== null && canReadWarehouse(user, target));
  if (!visible) throw new AppError(404, "El documento no existe");
  return { document, warehouse, target };
};

export const assertCanOperate = (user: IToken, warehouse: WarehouseModel, action: string) => {
  if (!canWriteWarehouse(user, warehouse)) throw new AppError(403, `No puedes ${action} en el almacén "${warehouse.name}" (no es de tu tienda)`);
};

// Cabecera + líneas validadas de un borrador (crear o editar).
export const validateDocumentInput = async (
  companyId: number,
  input: DocumentInput,
  user: IToken,
  transaction?: Transaction
): Promise<{ warehouse: WarehouseModel; target: WarehouseModel | null; lines: DocumentLineInput[] }> => {
  if (!REASONS[input.doc_type].includes(input.reason_code)) throw new AppError(400, "El motivo no corresponde al tipo de documento");

  const warehouse = await DataBase.instance.warehouse.findOne({ where: { id: input.warehouse_id, company_id: companyId, is_transit: false }, transaction });
  if (!warehouse || !warehouse.active) throw new AppError(400, "El almacén no existe o está deshabilitado");
  assertCanOperate(user, warehouse, "registrar documentos");

  let target: WarehouseModel | null = null;
  if (input.doc_type === "transfer") {
    if (!input.target_warehouse_id) throw new AppError(400, "Elige el almacén de destino");
    if (Number(input.target_warehouse_id) === Number(warehouse.id)) throw new AppError(400, "El destino tiene que ser otro almacén");
    target = await DataBase.instance.warehouse.findOne({
      where: { id: input.target_warehouse_id, company_id: companyId, is_transit: false },
      transaction,
    });
    if (!target || !target.active) throw new AppError(400, "El almacén de destino no existe o está deshabilitado");
  }

  const lines = await normalizeDocumentLines(companyId, input.doc_type, input.lines, transaction);
  return { warehouse, target, lines };
};

// Reemplaza las líneas de un borrador.
export const replaceDraftLines = async (
  companyId: number,
  documentId: number,
  lines: DocumentLineInput[],
  actorId: number,
  transaction: Transaction
) => {
  await DataBase.instance.stock_document_line.destroy({ where: { document_id: documentId }, transaction });
  const now = new Date();
  await DataBase.instance.stock_document_line.bulkCreate(
    lines.map((line) => ({
      id: 0,
      company_id: companyId,
      document_id: documentId,
      product_id: line.product_id,
      color_key: colorKeyOf(line.color),
      lot_id: line.lot_id ?? null,
      lot_code: line.lot_code?.trim() || null,
      expiry_date: line.expiry_date || null,
      quantity: String(round3(line.quantity)),
      received_quantity: null,
      unit_cost: line.unit_cost === null || line.unit_cost === undefined ? null : String(line.unit_cost),
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    })),
    { transaction }
  );
};

// Documentos con sus líneas, nombres de producto, lotes y usuario (pocas
// consultas para toda la lista).
export const toDocumentDtos = async (documents: StockDocumentModel[], user: IToken, withLines: boolean): Promise<DocumentDto[]> => {
  if (documents.length === 0) return [];
  const ids = documents.map((document) => Number(document.id));
  const warehouseIds = [...new Set(documents.flatMap((document) => [document.warehouse_id, document.target_warehouse_id ?? 0]).map(Number))];
  const [warehouses, lines, users] = await Promise.all([
    DataBase.instance.warehouse.findAll({ where: { id: { [Op.in]: warehouseIds } }, attributes: ["id", "name"] }),
    withLines ? DataBase.instance.stock_document_line.findAll({ where: { document_id: { [Op.in]: ids } }, order: [["id", "ASC"]] }) : Promise.resolve([]),
    DataBase.instance.user.findAll({
      where: { id: { [Op.in]: [...new Set(documents.map((document) => Number(document.created_by ?? 0)))] } },
      attributes: ["id", "name", "paternal_lastname"],
    }),
  ]);
  const [products, lots] = await Promise.all([
    lines.length
      ? DataBase.instance.product.findAll({ where: { id: { [Op.in]: [...new Set(lines.map((line) => Number(line.product_id)))] } }, attributes: ["id", "name"] })
      : Promise.resolve([]),
    lines.some((line) => line.lot_id)
      ? DataBase.instance.stock_lot.findAll({ where: { id: { [Op.in]: lines.flatMap((line) => (line.lot_id ? [Number(line.lot_id)] : [])) } }, attributes: ["id", "lot_code"] })
      : Promise.resolve([]),
  ]);
  const warehouseName = new Map(warehouses.map((warehouse) => [Number(warehouse.id), warehouse.name]));
  const productName = new Map(products.map((product) => [Number(product.id), product.name]));
  const lotCode = new Map(lots.map((lot) => [Number(lot.id), lot.lot_code]));
  const userName = new Map(users.map((row) => [Number(row.id), [row.name, row.paternal_lastname].filter(Boolean).join(" ")]));
  const showCosts = canSeeCosts(user);

  return documents.map((document) => ({
    id: Number(document.id),
    company_id: Number(document.company_id),
    doc_type: document.doc_type,
    reason_code: document.reason_code,
    number: documentNumberText(document),
    status: document.status,
    document_date: document.document_date,
    warehouse: { id: Number(document.warehouse_id), name: warehouseName.get(Number(document.warehouse_id)) ?? "" },
    targetWarehouse: document.target_warehouse_id
      ? { id: Number(document.target_warehouse_id), name: warehouseName.get(Number(document.target_warehouse_id)) ?? "" }
      : null,
    supplier_id: document.supplier_id === null ? null : Number(document.supplier_id),
    client_id: document.client_id === null ? null : Number(document.client_id),
    quotation_id: document.quotation_id === null ? null : Number(document.quotation_id),
    reversal_of_id: document.reversal_of_id === null ? null : Number(document.reversal_of_id),
    notes: document.notes,
    cancel_reason: document.cancel_reason,
    createdBy: userName.get(Number(document.created_by)) ?? null,
    createdAt: utcToBusinessParts(document.created_at),
    postedAt: document.posted_at ? utcToBusinessParts(document.posted_at) : null,
    lines: lines
      .filter((line) => Number(line.document_id) === Number(document.id))
      .map((line) => ({
        id: Number(line.id),
        product_id: Number(line.product_id),
        productName: productName.get(Number(line.product_id)) ?? "",
        color: line.color_key,
        lot_id: line.lot_id === null ? null : Number(line.lot_id),
        lotCode: line.lot_id ? lotCode.get(Number(line.lot_id)) ?? line.lot_code : line.lot_code,
        expiry_date: line.expiry_date,
        quantity: Number(line.quantity),
        received_quantity: line.received_quantity === null ? null : Number(line.received_quantity),
        unit_cost: showCosts && line.unit_cost !== null ? Number(line.unit_cost) : null,
      })),
  }));
};
