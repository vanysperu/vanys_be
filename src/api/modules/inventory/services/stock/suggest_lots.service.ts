import { DataBase } from "../../../../../database";
import { IToken } from "../../../../interfaces/IToken.interface";
import { findWarehouseForCaller } from "../shared/inventory_shared";
import { lotsByFefo } from "../shared/document_lines";

// Lotes con stock de un producto/color en un almacén, el que vence primero
// adelante (FEFO, plan §8.3): el formulario de salida lo sugiere.
export const suggestLotsService = async (warehouseId: number, productId: number, color: string, user: IToken) => {
  const warehouse = await findWarehouseForCaller(warehouseId, user, "read");
  const lots = await lotsByFefo(warehouse, productId, color);
  const codes = lots.length
    ? await DataBase.instance.stock_lot.findAll({ where: { id: lots.map((lot) => lot.lotId) }, attributes: ["id", "lot_code"] })
    : [];
  const codeById = new Map(codes.map((lot) => [Number(lot.id), lot.lot_code]));
  return lots.map((lot) => ({ lotId: lot.lotId, lotCode: codeById.get(lot.lotId) ?? "", expiryDate: lot.expiry, quantity: lot.onHand }));
};
