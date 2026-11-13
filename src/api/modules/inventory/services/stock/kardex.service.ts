import { Op, QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { businessLocalToUtc, utcToBusinessParts, addDaysToDateOnly } from "../../../../../utils/dateUtils";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../../core/utils/paginate";
import { canSeeCosts, documentNumberText } from "../documents/document_shared";
import { readableWarehouses } from "./readable_warehouses";
import { round3 } from "../shared/stock_engine";

export interface KardexRow {
  id: number;
  at: { date: string; time: string };
  warehouseName: string;
  document: { id: number; number: string; doc_type: string; reason_code: string };
  lotCode: string | null;
  quantityIn: number;
  quantityOut: number;
  balance: number;
  unitCost: number | null;
  userName: string | null;
}

export interface KardexResult extends PaginatedResult<KardexRow> {
  openingBalance: number;
  closingBalance: number;
}

// Kardex (plan §8.3): movimientos de un producto (y color) en un almacén —o en
// todos los que el usuario ve— en un rango de fechas, con saldo acumulado. El
// saldo inicial es la suma de todo lo anterior al rango; así el kardex cuadra
// con el saldo actual.
export const kardexService = async (
  params: { companyId: number; productId: number; color?: string; warehouseId?: number; dateFrom?: string; dateTo?: string; page: number; limit: number },
  user: IToken
): Promise<KardexResult> => {
  const warehouses = (await readableWarehouses(params.companyId, user, true)).filter(
    (warehouse) => !params.warehouseId || Number(warehouse.id) === params.warehouseId
  );
  if (params.warehouseId && warehouses.length === 0) throw new AppError(404, "El almacén no existe");
  // Sin almacén puntual, el kardex consolidado no cuenta el de tránsito (no es stock físico de nadie).
  const scoped = params.warehouseId ? warehouses : warehouses.filter((warehouse) => !warehouse.is_transit);
  const replacements = {
    warehouseIds: scoped.map((warehouse) => Number(warehouse.id)),
    productId: params.productId,
    color: params.color?.trim() ?? "",
    from: params.dateFrom ? businessLocalToUtc(params.dateFrom, "00:00") : null,
    to: params.dateTo ? businessLocalToUtc(addDaysToDateOnly(params.dateTo, 1), "00:00") : null,
    limit: params.limit,
    offset: getOffset(params.page, params.limit),
  };
  if (replacements.warehouseIds.length === 0) {
    return { data: [], meta: buildPaginationMeta(0, params.page, params.limit), openingBalance: 0, closingBalance: 0 };
  }
  const base = "warehouse_id IN (:warehouseIds) AND product_id = :productId AND color_key = :color";
  const inRange = `${base} AND (:from IS NULL OR movement_at >= :from) AND (:to IS NULL OR movement_at < :to)`;

  const [opening, totals, beforePage] = (await Promise.all([
    DataBase.instance.sequelize.query(`SELECT COALESCE(SUM(quantity), 0) AS value FROM stock_movement WHERE ${base} AND :from IS NOT NULL AND movement_at < :from`, {
      type: QueryTypes.SELECT,
      replacements,
    }),
    DataBase.instance.sequelize.query(`SELECT COUNT(*) AS total, COALESCE(SUM(quantity), 0) AS value FROM stock_movement WHERE ${inRange}`, {
      type: QueryTypes.SELECT,
      replacements,
    }),
    DataBase.instance.sequelize.query(
      `SELECT COALESCE(SUM(quantity), 0) AS value FROM (
         SELECT quantity FROM stock_movement WHERE ${inRange} ORDER BY movement_at ASC, id ASC LIMIT :offset
       ) t`,
      { type: QueryTypes.SELECT, replacements }
    ),
  ])) as [{ value: string }[], { total: string; value: string }[], { value: string }[]];

  const rows = await DataBase.instance.stock_movement.findAll({
    where: {
      warehouse_id: { [Op.in]: replacements.warehouseIds },
      product_id: params.productId,
      color_key: replacements.color,
      ...(replacements.from || replacements.to
        ? { movement_at: { ...(replacements.from ? { [Op.gte]: replacements.from } : {}), ...(replacements.to ? { [Op.lt]: replacements.to } : {}) } }
        : {}),
    },
    order: [
      ["movement_at", "ASC"],
      ["id", "ASC"],
    ],
    limit: params.limit,
    offset: replacements.offset,
  });

  const [documents, lots, users] = await Promise.all([
    DataBase.instance.stock_document.findAll({ where: { id: { [Op.in]: [...new Set(rows.map((row) => Number(row.document_id)))] } } }),
    DataBase.instance.stock_lot.findAll({ where: { id: { [Op.in]: rows.flatMap((row) => (Number(row.lot_key) ? [Number(row.lot_key)] : [])) } }, attributes: ["id", "lot_code"] }),
    DataBase.instance.user.findAll({ where: { id: { [Op.in]: [...new Set(rows.map((row) => Number(row.created_by ?? 0)))] } }, attributes: ["id", "name", "paternal_lastname"] }),
  ]);
  const documentById = new Map(documents.map((document) => [Number(document.id), document]));
  const lotCode = new Map(lots.map((lot) => [Number(lot.id), lot.lot_code]));
  const userName = new Map(users.map((row) => [Number(row.id), [row.name, row.paternal_lastname].filter(Boolean).join(" ")]));
  const warehouseName = new Map(warehouses.map((warehouse) => [Number(warehouse.id), warehouse.name]));
  const showCosts = canSeeCosts(user);

  const openingBalance = round3(Number(opening[0]?.value ?? 0));
  let balance = round3(openingBalance + Number(beforePage[0]?.value ?? 0));
  const data = rows.map((row) => {
    const quantity = Number(row.quantity);
    balance = round3(balance + quantity);
    const document = documentById.get(Number(row.document_id));
    return {
      id: Number(row.id),
      at: utcToBusinessParts(row.movement_at),
      warehouseName: warehouseName.get(Number(row.warehouse_id)) ?? "",
      document: {
        id: Number(row.document_id),
        number: document ? documentNumberText(document) : "",
        doc_type: document?.doc_type ?? "",
        reason_code: document?.reason_code ?? "",
      },
      lotCode: Number(row.lot_key) ? lotCode.get(Number(row.lot_key)) ?? null : null,
      quantityIn: quantity > 0 ? quantity : 0,
      quantityOut: quantity < 0 ? -quantity : 0,
      balance,
      unitCost: showCosts && row.unit_cost !== null ? Number(row.unit_cost) : null,
      userName: userName.get(Number(row.created_by)) ?? null,
    };
  });
  return {
    data,
    meta: buildPaginationMeta(Number(totals[0]?.total ?? 0), params.page, params.limit),
    openingBalance,
    closingBalance: round3(openingBalance + Number(totals[0]?.value ?? 0)),
  };
};
