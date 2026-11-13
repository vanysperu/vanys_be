import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { todayInBusinessTz } from "../../../../../utils/dateUtils";
import type { DocType, StockDocumentLineModel, WarehouseModel } from "../../model/inventory.models";
import type { DocumentLineInput } from "../../types/inventory.types";
import { round3, type MovementInput } from "./stock_engine";
import { colorKeyOf } from "./inventory_shared";

export const MAX_DOCUMENT_LINES = 200;

interface ProductInfo {
  id: number;
  name: string;
  tracks_stock: boolean;
  is_perishable: boolean;
  colors: string[];
}

const loadProducts = async (companyId: number, productIds: number[], transaction?: Transaction): Promise<Map<number, ProductInfo>> => {
  const ids = [...new Set(productIds)];
  const [products, colors] = await Promise.all([
    DataBase.instance.product.findAll({
      where: { id: { [Op.in]: ids }, company_id: companyId },
      attributes: ["id", "name", "tracks_stock", "is_perishable"],
      transaction,
    }),
    DataBase.instance.product_color.findAll({ where: { product_id: { [Op.in]: ids } }, attributes: ["product_id", "name"], transaction }),
  ]);
  return new Map(
    products.map((product) => [
      Number(product.id),
      {
        id: Number(product.id),
        name: product.name,
        tracks_stock: Boolean(product.tracks_stock),
        is_perishable: Boolean(product.is_perishable),
        colors: colors.filter((color) => Number(color.product_id) === Number(product.id)).map((color) => color.name),
      },
    ])
  );
};

// Valida las líneas de un documento (borrador o al confirmar) y deja el color
// con el nombre exacto del producto. Errores claros por línea (n° de fila).
export const normalizeDocumentLines = async (
  companyId: number,
  docType: DocType,
  lines: DocumentLineInput[],
  transaction?: Transaction
): Promise<DocumentLineInput[]> => {
  if (lines.length === 0) throw new AppError(400, "Agrega al menos un producto");
  if (lines.length > MAX_DOCUMENT_LINES) throw new AppError(400, `Máximo ${MAX_DOCUMENT_LINES} líneas por documento`);
  const products = await loadProducts(companyId, lines.map((line) => Number(line.product_id)), transaction);

  return lines.map((line, index) => {
    const row = `Fila ${index + 1}`;
    const product = products.get(Number(line.product_id));
    if (!product) throw new AppError(400, `${row}: el producto no existe en esta empresa`);
    if (!product.tracks_stock) throw new AppError(400, `${row}: "${product.name}" no maneja stock`, undefined, "PRODUCT_WITHOUT_STOCK");

    const quantity = round3(Number(line.quantity));
    if (!Number.isFinite(quantity) || quantity === 0) throw new AppError(400, `${row}: la cantidad no puede ser 0`);
    if (docType !== "adjustment" && quantity < 0) throw new AppError(400, `${row}: la cantidad tiene que ser positiva`);

    const wanted = colorKeyOf(line.color);
    const color = product.colors.find((name) => name.toUpperCase() === wanted.toUpperCase());
    if (product.colors.length > 0 && !color) {
      throw new AppError(400, wanted ? `${row}: "${product.name}" no tiene el color "${wanted}"` : `${row}: elige el color de "${product.name}"`);
    }
    if (product.colors.length === 0 && wanted) throw new AppError(400, `${row}: "${product.name}" no tiene colores`);

    const unitCost = line.unit_cost === null || line.unit_cost === undefined ? null : Number(line.unit_cost);
    if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0)) throw new AppError(400, `${row}: el costo no es válido`);
    return { ...line, product_id: product.id, color: color ?? "", quantity, unit_cost: unitCost };
  });
};

// Ingreso a un almacén con lotes: crea (o reutiliza) el lote de cada línea.
// Sin código se genera uno con la fecha y el n° de documento.
export const resolveEntryLots = async (
  companyId: number,
  warehouse: WarehouseModel,
  lines: StockDocumentLineModel[],
  documentNumber: string,
  actorId: number | null,
  transaction: Transaction
): Promise<Map<number, number>> => {
  const lotByLine = new Map<number, number>();
  if (!warehouse.track_lots) return lotByLine;
  const perishable = await loadProducts(companyId, lines.map((line) => Number(line.product_id)), transaction);
  const now = new Date();

  for (const line of lines) {
    if (Number(line.quantity) <= 0) continue;
    const product = perishable.get(Number(line.product_id));
    const needsExpiry = warehouse.track_expiry && product?.is_perishable;
    if (needsExpiry && !line.expiry_date) {
      throw new AppError(400, `"${product?.name ?? "Producto"}" es perecible: indica el vencimiento del lote`, undefined, "LOT_EXPIRY_REQUIRED");
    }
    const lotCode = line.lot_code?.trim() || `L${todayInBusinessTz().replace(/-/g, "")}-${documentNumber}`;
    await DataBase.instance.sequelize.query(
      `INSERT IGNORE INTO stock_lot (company_id, product_id, color_key, lot_code, expiry_date, supplier_id, created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
      { replacements: [companyId, line.product_id, line.color_key, lotCode, line.expiry_date ?? null, actorId, now, actorId, now], transaction }
    );
    const lot = await DataBase.instance.stock_lot.findOne({
      where: { company_id: companyId, product_id: line.product_id, color_key: line.color_key, lot_code: lotCode },
      transaction,
    });
    if (!lot) throw new AppError(500, "No se pudo registrar el lote");
    lotByLine.set(Number(line.id), Number(lot.id));
    await line.update({ lot_id: lot.id, lot_code: lotCode }, { transaction });
  }
  return lotByLine;
};

interface LotStock {
  lotId: number;
  onHand: number;
  expiry: string | null;
}

// Lotes con stock de un producto/color en un almacén, el que vence primero
// adelante (FEFO). Los vencidos se excluyen si el almacén los bloquea.
export const lotsByFefo = async (
  warehouse: WarehouseModel,
  productId: number,
  colorKey: string,
  transaction?: Transaction
): Promise<LotStock[]> => {
  const balances = await DataBase.instance.stock_balance.findAll({
    where: { warehouse_id: warehouse.id, product_id: productId, color_key: colorKey, lot_key: { [Op.ne]: 0 }, on_hand: { [Op.gt]: 0 } },
    attributes: ["lot_key", "on_hand"],
    transaction,
  });
  if (balances.length === 0) return [];
  const lots = await DataBase.instance.stock_lot.findAll({
    where: { id: { [Op.in]: balances.map((balance) => balance.lot_key) } },
    attributes: ["id", "expiry_date"],
    transaction,
  });
  const expiryById = new Map(lots.map((lot) => [Number(lot.id), lot.expiry_date]));
  const today = todayInBusinessTz();
  return balances
    .map((balance) => ({ lotId: Number(balance.lot_key), onHand: Number(balance.on_hand), expiry: expiryById.get(Number(balance.lot_key)) ?? null }))
    .filter((lot) => !(warehouse.block_expired && lot.expiry !== null && lot.expiry < today))
    .sort((a, b) => (a.expiry ?? "9999-12-31").localeCompare(b.expiry ?? "9999-12-31") || a.lotId - b.lotId);
};

// Salida (o envío de una transferencia) de un almacén: sin lotes es una sola
// salida; con lotes se usa el lote elegido o se reparte por FEFO. Si no
// alcanza en los lotes, el motor responde INSUFFICIENT_STOCK.
export const outgoingMovements = async (
  warehouse: WarehouseModel,
  line: StockDocumentLineModel,
  quantity: number,
  transaction: Transaction
): Promise<MovementInput[]> => {
  const base = { warehouseId: Number(warehouse.id), productId: Number(line.product_id), colorKey: line.color_key, documentLineId: Number(line.id) };
  if (!warehouse.track_lots) return [{ ...base, lotKey: 0, quantity: -quantity }];

  if (line.lot_id) {
    const lot = await DataBase.instance.stock_lot.findByPk(line.lot_id, { attributes: ["expiry_date", "lot_code"], transaction });
    if (warehouse.block_expired && lot?.expiry_date && lot.expiry_date < todayInBusinessTz()) {
      throw new AppError(409, `El lote ${lot.lot_code} está vencido`, undefined, "LOT_EXPIRED");
    }
    return [{ ...base, lotKey: Number(line.lot_id), quantity: -quantity }];
  }

  const movements: MovementInput[] = [];
  let pending = quantity;
  for (const lot of await lotsByFefo(warehouse, Number(line.product_id), line.color_key, transaction)) {
    if (pending <= 0) break;
    const take = round3(Math.min(pending, lot.onHand));
    movements.push({ ...base, lotKey: lot.lotId, quantity: -take });
    pending = round3(pending - take);
  }
  // Lo que falta sale del "sin lote" para que el motor avise cuánto falta.
  if (pending > 0) movements.push({ ...base, lotKey: 0, quantity: -pending });
  return movements;
};
