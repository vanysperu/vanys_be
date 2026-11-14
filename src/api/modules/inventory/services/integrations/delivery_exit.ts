import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc, todayInBusinessTz } from "../../../../../utils/dateUtils";
import type { QuotationModel } from "../../../quotation/model/quotation.model";
import type { WarehouseModel } from "../../model/inventory.models";
import { hasCompanyFeature } from "../../../company_feature/services/shared/feature_store";
import { applyMovements, round3, type MovementInput } from "../shared/stock_engine";
import { colorKeyOf, nextDocumentNumber } from "../shared/inventory_shared";
import { outgoingMovements } from "../shared/document_lines";
import { documentNumberText } from "../documents/document_shared";

export interface SaleExitLine {
  productId: number;
  color: string | null;
  quantity: number;
}

/**
 * Salida de venta (D4) en la transacción del llamador: solo productos que
 * manejan stock, del almacén indicado. Si no alcanza el stock, la salida queda
 * en BORRADOR (no se frena la entrega ni la guía) y se avisa a quien la generó
 * para que la confirme cuando haya stock. null = no había nada que descontar.
 */
export const createSaleExit = async ({
  companyId,
  warehouse,
  quotationId,
  clientId,
  dispatchGuideId = null,
  lines: requestedLines,
  note,
  actorId,
  transaction,
}: {
  companyId: number;
  warehouse: WarehouseModel;
  quotationId: number | null;
  clientId: number | null;
  dispatchGuideId?: number | null;
  lines: SaleExitLine[];
  note: string;
  actorId: number | null;
  transaction: Transaction;
}): Promise<{ documentId: number; posted: boolean } | null> => {
  const tracked = await DataBase.instance.product.findAll({
    where: { id: { [Op.in]: requestedLines.map((line) => line.productId) }, tracks_stock: true },
    attributes: ["id"],
    transaction,
  });
  const trackedIds = new Set(tracked.map((product) => Number(product.id)));
  const grouped = new Map<string, { productId: number; color: string; quantity: number }>();
  for (const line of requestedLines) {
    if (!trackedIds.has(line.productId)) continue;
    const color = colorKeyOf(line.color);
    const key = `${line.productId}|${color}`;
    const current = grouped.get(key) ?? { productId: line.productId, color, quantity: 0 };
    grouped.set(key, { ...current, quantity: round3(current.quantity + line.quantity) });
  }
  if (grouped.size === 0) return null;

  const now = nowUtc();
  const { series, number } = await nextDocumentNumber(companyId, "exit", actorId, transaction);
  const document = await DataBase.instance.stock_document.create(
    {
      id: 0,
      company_id: companyId,
      business_unit_id: warehouse.business_unit_id,
      warehouse_id: warehouse.id,
      target_warehouse_id: null,
      doc_type: "exit",
      reason_code: "sale",
      series,
      number,
      status: "draft",
      document_date: todayInBusinessTz(),
      supplier_id: null,
      client_id: clientId,
      quotation_id: quotationId,
      dispatch_guide_id: dispatchGuideId,
      reversal_of_id: null,
      notes: note.slice(0, 500),
      posted_at: null,
      posted_by: null,
      received_at: null,
      received_by: null,
      cancelled_at: null,
      cancelled_by: null,
      cancel_reason: null,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    },
    { transaction }
  );
  const lines = await DataBase.instance.stock_document_line.bulkCreate(
    [...grouped.values()].map((line) => ({
      id: 0,
      company_id: companyId,
      document_id: document.id,
      product_id: line.productId,
      color_key: line.color,
      lot_id: null,
      lot_code: null,
      expiry_date: null,
      quantity: String(line.quantity),
      received_quantity: null,
      unit_cost: null,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    })),
    { transaction }
  );

  try {
    // Punto de guardado: si falta stock, se deshace solo el intento de
    // confirmar; la entrega (o la guía) y el borrador siguen.
    await DataBase.instance.sequelize.transaction({ transaction }, async (savepoint) => {
      const movements: MovementInput[] = [];
      for (const line of lines) movements.push(...(await outgoingMovements(warehouse, line, Number(line.quantity), savepoint)));
      await applyMovements({ companyId, documentId: Number(document.id), movements, actorId, movementAt: now, transaction: savepoint });
      await document.update({ status: "posted", posted_at: now, posted_by: actorId }, { transaction: savepoint });
    });
    return { documentId: Number(document.id), posted: true };
  } catch (error: unknown) {
    if (!(error instanceof AppError) || (error.code !== "INSUFFICIENT_STOCK" && error.code !== "LOT_EXPIRED")) throw error;
    await document.update({ notes: `${note} Sin stock suficiente: confírmala cuando ingrese.`.slice(0, 500) }, { transaction });
    if (actorId) {
      await DataBase.instance.reminder.create(
        {
          id: 0,
          company_id: companyId,
          recipient_user_id: actorId,
          title: "Salida de almacén pendiente",
          message: `${note} No había stock suficiente en "${warehouse.name}". La salida ${documentNumberText(document)} quedó en borrador.`.slice(0, 500),
          remind_at: now,
          read_at: null,
          is_deleted: false,
          created_by: actorId,
          created_at: now,
          updated_by: actorId,
          updated_at: now,
        },
        { transaction }
      );
    }
    return { documentId: Number(document.id), posted: false };
  }
};

// D4 (Sprint 2, ítem 2): la venta descuenta el stock al marcar la cotización
// como Entregada (o al registrar la guía de remisión: lo elige la tienda). Va
// dentro de la transacción del cambio de estado. Sale del almacén
// predeterminado de la tienda de la cotización, solo productos que manejan
// stock. Si no alcanza, la salida queda en BORRADOR (no se frena la entrega) y
// se avisa a quien la entregó para que la confirme cuando haya stock.
export const createDeliveryExit = async ({
  quotation,
  actorId,
  transaction,
}: {
  quotation: Pick<QuotationModel, "id" | "company_id" | "business_unit_id" | "client_id">;
  actorId: number | null;
  transaction: Transaction;
}): Promise<{ documentId: number; posted: boolean } | null> => {
  const companyId = Number(quotation.company_id);
  if (!quotation.business_unit_id || !(await hasCompanyFeature(companyId, "inventory", transaction))) return null;
  const store = await DataBase.instance.business_unit.findByPk(quotation.business_unit_id, {
    attributes: ["id", "inventory_enabled", "inventory_exit_on"],
    transaction,
  });
  if (!store?.inventory_enabled || store.inventory_exit_on !== "delivered") return null;

  const warehouse = await DataBase.instance.warehouse.findOne({
    where: { business_unit_id: store.id, is_default: true, active: true, is_transit: false },
    transaction,
  });
  if (!warehouse) return null;

  // Ya se descontó (la cotización volvió a Entregada): no se descuenta dos veces.
  const existing = await DataBase.instance.stock_document.findOne({
    where: { quotation_id: quotation.id, doc_type: "exit", reason_code: "sale", status: { [Op.ne]: "cancelled" } },
    attributes: ["id"],
    transaction,
  });
  if (existing) return null;

  const items = await DataBase.instance.quotation_item.findAll({ where: { quotation_id: quotation.id, is_excluded: false }, attributes: ["product_id", "color", "quantity"], transaction });
  return createSaleExit({
    companyId,
    warehouse,
    quotationId: Number(quotation.id),
    clientId: quotation.client_id ?? null,
    lines: items.map((item) => ({ productId: Number(item.product_id), color: item.color, quantity: Number(item.quantity) })),
    note: `Entrega de la cotización #${quotation.id}.`,
    actorId,
    transaction,
  });
};
