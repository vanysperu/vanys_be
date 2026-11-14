import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { round3 } from "../../../inventory/services/shared/stock_engine";
import { colorKeyOf } from "../../../inventory/services/shared/inventory_shared";

// Control de lo despachado por producto (plan §9.4, entregas parciales): una
// cotización puede tener varias guías, y entre todas las que no están
// anuladas (registradas o en borrador) no pueden llevar más de lo pedido.
//
// Se controla por producto + color dentro de la cotización y no por ítem:
// editar una cotización borra y recrea sus ítems (los ids cambian), y el
// mismo producto y color puede venir en varios ítems.

export interface DispatchBalance {
  productId: number;
  color: string;
  ordered: number;
  dispatched: number;
}

const keyOf = (productId: number, color: string) => `${productId}|${color}`;

export const quotationDispatchBalances = async (
  quotationId: number,
  excludeGuideId: number | null,
  transaction?: Transaction
): Promise<Map<string, DispatchBalance>> => {
  const items = await DataBase.instance.quotation_item.findAll({
    // Lo que el cliente no aceptó no se despacha.
    where: { quotation_id: quotationId, is_excluded: false },
    attributes: ["product_id", "color", "quantity"],
    transaction,
  });
  const balances = new Map<string, DispatchBalance>();
  for (const item of items) {
    const color = colorKeyOf(item.color);
    const key = keyOf(Number(item.product_id), color);
    const current = balances.get(key) ?? { productId: Number(item.product_id), color, ordered: 0, dispatched: 0 };
    balances.set(key, { ...current, ordered: round3(current.ordered + Number(item.quantity)) });
  }

  const dispatchedRows = (await DataBase.instance.sequelize.query(
    `SELECT line.product_id AS productId, line.color AS color, SUM(line.quantity) AS quantity
     FROM dispatch_guide_line line
     INNER JOIN dispatch_guide guide ON guide.id = line.guide_id
     WHERE guide.quotation_id = ? AND guide.status <> 'voided' AND guide.id <> ? AND line.product_id IS NOT NULL
     GROUP BY line.product_id, line.color`,
    { replacements: [quotationId, excludeGuideId ?? 0], type: QueryTypes.SELECT, transaction }
  )) as { productId: number; color: string; quantity: string }[];

  for (const row of dispatchedRows) {
    const key = keyOf(Number(row.productId), row.color);
    const current = balances.get(key) ?? { productId: Number(row.productId), color: row.color, ordered: 0, dispatched: 0 };
    balances.set(key, { ...current, dispatched: round3(current.dispatched + Number(row.quantity)) });
  }
  return balances;
};

export interface DispatchLine {
  productId: number | null;
  color: string;
  quantity: number;
}

// Frena (409) una guía que lleva un producto que no está en la cotización o
// más de lo que falta despachar. Quien llama ya bloqueó la fila de la
// cotización (SELECT ... FOR UPDATE): dos guías a la vez no se pasan.
export const assertWithinOrdered = async (
  quotationId: number,
  lines: DispatchLine[],
  excludeGuideId: number | null,
  transaction: Transaction
): Promise<void> => {
  const balances = await quotationDispatchBalances(quotationId, excludeGuideId, transaction);
  const requested = new Map<string, DispatchLine & { productId: number }>();
  for (const line of lines) {
    if (line.productId === null) continue;
    const key = keyOf(line.productId, line.color);
    const current = requested.get(key);
    requested.set(key, { productId: line.productId, color: line.color, quantity: round3((current?.quantity ?? 0) + line.quantity) });
  }

  const notInQuotation = [...requested.keys()].filter((key) => !balances.has(key));
  if (notInQuotation.length > 0) {
    throw new AppError(409, "La guía lleva un producto (o color) que no está en la cotización", undefined, "GUIDE_LINE_NOT_IN_QUOTATION");
  }

  const exceeded = [...requested.entries()]
    .map(([key, line]) => ({ line, balance: balances.get(key) as DispatchBalance }))
    .filter(({ line, balance }) => round3(balance.dispatched + line.quantity) > balance.ordered)
    .map(({ line, balance }) => ({
      productId: line.productId,
      color: line.color,
      ordered: balance.ordered,
      dispatched: balance.dispatched,
      requested: line.quantity,
      pending: round3(balance.ordered - balance.dispatched),
    }));
  if (exceeded.length === 0) return;
  throw new AppError(
    409,
    "La guía lleva más de lo que falta despachar de la cotización",
    { lines: exceeded },
    "DISPATCH_EXCEEDS_PENDING"
  );
};
