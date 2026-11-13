import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import type { StockMovementAttributes } from "../../model/inventory.models";
import { AppError } from "../../../../../core/errors/AppError";

// Cantidades con 3 decimales (DECIMAL(14,3)): se redondea en cada paso para no
// arrastrar errores de punto flotante.
export const round3 = (value: number): number => Math.round(value * 1000) / 1000;
const round4 = (value: number): number => Math.round(value * 10000) / 10000;

export interface MovementInput {
  warehouseId: number;
  productId: number;
  // Nombre del color ('' = sin color) y lote (0 = sin lote).
  colorKey: string;
  lotKey: number;
  // Con signo: + entra, − sale.
  quantity: number;
  // Solo entradas: costo unitario. null = al costo promedio actual (ej. el
  // ingreso de una transferencia o una devolución).
  unitCost?: number | null;
  documentLineId: number | null;
}

interface ApplyOptions {
  companyId: number;
  documentId: number;
  movements: MovementInput[];
  actorId: number | null;
  movementAt: Date;
  transaction: Transaction;
}

export interface InsufficientLine {
  productId: number;
  productName: string;
  color: string;
  warehouseId: number;
  available: number;
  requested: number;
}

const keyOf = (movement: Pick<MovementInput, "warehouseId" | "productId" | "colorKey" | "lotKey">) =>
  `${movement.warehouseId}|${movement.productId}|${movement.colorKey}|${movement.lotKey}`;

// Orden fijo de bloqueo: dos documentos que tocan los mismos saldos los
// bloquean en el mismo orden y no se traban entre sí.
const compareMovements = (a: MovementInput, b: MovementInput) =>
  a.warehouseId - b.warehouseId || a.productId - b.productId || a.colorKey.localeCompare(b.colorKey) || a.lotKey - b.lotKey;

// Crea las filas de saldo que falten (en 0) sin pisar las existentes.
const ensureBalanceRows = async (companyId: number, movements: MovementInput[], actorId: number | null, transaction: Transaction) => {
  const unique = [...new Map(movements.map((movement) => [keyOf(movement), movement])).values()];
  const now = new Date();
  await DataBase.instance.sequelize.query(
    `INSERT IGNORE INTO stock_balance
       (company_id, warehouse_id, product_id, color_key, lot_key, on_hand, reserved, created_by, created_at, updated_by, updated_at)
     VALUES ${unique.map(() => "(?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)").join(", ")}`,
    {
      replacements: unique.flatMap((movement) => [
        companyId,
        movement.warehouseId,
        movement.productId,
        movement.colorKey,
        movement.lotKey,
        actorId,
        now,
        actorId,
        now,
      ]),
      transaction,
    }
  );
};

// Costo promedio ponderado por producto y color a nivel EMPRESA (D3): se
// recalcula en cada entrada con costo, antes de sumarla al saldo.
const updateAverageCosts = async (
  companyId: number,
  incoming: MovementInput[],
  actorId: number | null,
  transaction: Transaction
): Promise<Map<string, number>> => {
  const averages = new Map<string, number>();
  const byProductColor = new Map<string, MovementInput[]>();
  for (const movement of incoming) {
    const key = `${movement.productId}|${movement.colorKey}`;
    byProductColor.set(key, [...(byProductColor.get(key) ?? []), movement]);
  }

  const now = new Date();
  for (const [key, lines] of [...byProductColor.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [productIdText, colorKey = ""] = key.split("|");
    const productId = Number(productIdText);
    await DataBase.instance.sequelize.query(
      `INSERT IGNORE INTO stock_cost (company_id, product_id, color_key, avg_cost, created_by, created_at, updated_by, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
      { replacements: [companyId, productId, colorKey, actorId, now, actorId, now], transaction }
    );
    const cost = await DataBase.instance.stock_cost.findOne({
      where: { company_id: companyId, product_id: productId, color_key: colorKey },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!cost) continue;
    const onHandRaw = await DataBase.instance.stock_balance.sum("on_hand", {
      where: { company_id: companyId, product_id: productId, color_key: colorKey },
      transaction,
    });
    let quantity = Math.max(0, Number(onHandRaw ?? 0));
    let average = Number(cost.avg_cost);
    for (const line of lines) {
      if (line.unitCost === null || line.unitCost === undefined) continue;
      average = quantity + line.quantity > 0 ? round4((quantity * average + line.quantity * line.unitCost) / (quantity + line.quantity)) : line.unitCost;
      quantity += line.quantity;
    }
    await cost.update({ avg_cost: String(average), updated_by: actorId, updated_at: now }, { transaction });
    averages.set(key, average);
  }
  return averages;
};

// Mueve el stock: libro (stock_movement) y saldos (stock_balance) en la misma
// transacción del documento, con los saldos bloqueados (SELECT ... FOR UPDATE).
// Si un almacén no permite negativo y algún saldo quedaría bajo 0, no mueve
// nada y responde 409 INSUFFICIENT_STOCK con el detalle de cada producto.
export const applyMovements = async ({ companyId, documentId, movements, actorId, movementAt, transaction }: ApplyOptions): Promise<void> => {
  if (movements.length === 0) return;
  const sorted = [...movements].sort(compareMovements);
  const warehouseIds = [...new Set(sorted.map((movement) => movement.warehouseId))];
  const warehouses = await DataBase.instance.warehouse.findAll({
    where: { id: { [Op.in]: warehouseIds }, company_id: companyId },
    attributes: ["id", "allow_negative_stock"],
    transaction,
  });
  const allowNegative = new Map(warehouses.map((warehouse) => [Number(warehouse.id), Boolean(warehouse.allow_negative_stock)]));
  if (warehouses.length !== warehouseIds.length) throw new AppError(400, "Uno de los almacenes no es de esta empresa");

  const incoming = sorted.filter((movement) => movement.quantity > 0);
  const averages = await updateAverageCosts(companyId, incoming, actorId, transaction);
  // Costo de las salidas: el promedio vigente (se lee una vez por producto/color).
  const costFor = async (movement: MovementInput): Promise<number | null> => {
    const key = `${movement.productId}|${movement.colorKey}`;
    if (movement.quantity > 0 && movement.unitCost !== null && movement.unitCost !== undefined) return movement.unitCost;
    if (averages.has(key)) return averages.get(key) ?? null;
    const cost = await DataBase.instance.stock_cost.findOne({
      where: { company_id: companyId, product_id: movement.productId, color_key: movement.colorKey },
      attributes: ["avg_cost"],
      transaction,
    });
    const value = cost ? Number(cost.avg_cost) : null;
    averages.set(key, value ?? 0);
    return value;
  };

  await ensureBalanceRows(companyId, sorted, actorId, transaction);
  const balances = new Map<string, { id: number; onHand: number }>();
  for (const movement of sorted) {
    const key = keyOf(movement);
    if (balances.has(key)) continue;
    const row = await DataBase.instance.stock_balance.findOne({
      where: {
        warehouse_id: movement.warehouseId,
        product_id: movement.productId,
        color_key: movement.colorKey,
        lot_key: movement.lotKey,
      },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!row) throw new AppError(500, "No se pudo reservar el saldo de stock");
    balances.set(key, { id: Number(row.id), onHand: Number(row.on_hand) });
  }

  const insufficient: Omit<InsufficientLine, "productName">[] = [];
  const rows: StockMovementAttributes[] = [];
  const now = new Date();
  for (const movement of sorted) {
    const balance = balances.get(keyOf(movement));
    if (!balance) continue;
    const next = round3(balance.onHand + movement.quantity);
    if (movement.quantity < 0 && next < 0 && !allowNegative.get(movement.warehouseId)) {
      insufficient.push({
        productId: movement.productId,
        color: movement.colorKey,
        warehouseId: movement.warehouseId,
        available: Math.max(0, balance.onHand),
        requested: round3(-movement.quantity),
      });
    }
    balance.onHand = next;
    rows.push({
      id: 0,
      company_id: companyId,
      warehouse_id: movement.warehouseId,
      product_id: movement.productId,
      color_key: movement.colorKey,
      lot_key: movement.lotKey,
      quantity: String(round3(movement.quantity)),
      balance_after: String(next),
      unit_cost: (await costFor(movement))?.toString() ?? null,
      document_id: documentId,
      document_line_id: movement.documentLineId,
      movement_at: movementAt,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    });
  }
  if (insufficient.length > 0) throw await insufficientStockError(insufficient, transaction);

  for (const balance of balances.values()) {
    await DataBase.instance.stock_balance.update(
      { on_hand: String(balance.onHand), updated_by: actorId, updated_at: now },
      { where: { id: balance.id }, transaction }
    );
  }
  await DataBase.instance.stock_movement.bulkCreate(rows, { transaction });
};

const insufficientStockError = async (lines: Omit<InsufficientLine, "productName">[], transaction: Transaction): Promise<AppError> => {
  const products = await DataBase.instance.product.findAll({
    where: { id: { [Op.in]: [...new Set(lines.map((line) => line.productId))] } },
    attributes: ["id", "name"],
    transaction,
  });
  const names = new Map(products.map((product) => [Number(product.id), product.name]));
  const detail: InsufficientLine[] = lines.map((line) => ({ ...line, productName: names.get(line.productId) ?? "Producto" }));
  const first = detail[0];
  const firstText = first ? `"${first.productName}${first.color ? ` ${first.color}` : ""}": hay ${first.available}, se piden ${first.requested}` : "";
  return new AppError(409, `No hay stock suficiente. ${firstText}`.trim(), { lines: detail }, "INSUFFICIENT_STOCK");
};
