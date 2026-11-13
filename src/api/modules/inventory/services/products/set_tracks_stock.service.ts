import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";

export const MAX_BULK_PRODUCTS = 500;

// "Maneja stock" en bloque (D14: al activar el inventario los existentes
// arrancan apagados y se encienden juntos). productIds vacío + all = todos
// los activos de la empresa. Apagar uno con stock se rechaza.
export const setTracksStockService = async (
  companyId: number,
  input: { productIds?: number[]; all?: boolean; tracksStock: boolean },
  actorId: number
): Promise<{ updated: number }> => {
  const ids = input.productIds ?? [];
  if (!input.all && ids.length === 0) throw new AppError(400, "Elige los productos");
  if (ids.length > MAX_BULK_PRODUCTS) throw new AppError(400, `Máximo ${MAX_BULK_PRODUCTS} productos a la vez`);
  const scope = { company_id: companyId, is_deleted: false, ...(input.all ? {} : { id: { [Op.in]: ids } }) };

  if (!input.tracksStock) {
    const products = await DataBase.instance.product.findAll({ where: scope, attributes: ["id"] });
    const withStock = await DataBase.instance.stock_balance.findOne({
      where: { product_id: { [Op.in]: products.map((product) => product.id) }, on_hand: { [Op.ne]: 0 } },
      attributes: ["product_id"],
    });
    if (withStock) throw new AppError(409, "Uno de los productos tiene stock en un almacén: no se puede dejar de manejar stock", undefined, "PRODUCT_HAS_STOCK");
  }
  const [updated] = await DataBase.instance.product.update({ tracks_stock: input.tracksStock, updated_by: actorId, updated_at: nowUtc() }, { where: scope });
  return { updated };
};
