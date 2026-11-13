import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc, todayInBusinessTz } from "../../../../../utils/dateUtils";
import type { QuotationModel } from "../../../quotation/model/quotation.model";
import { hasCompanyFeature } from "../../../company_feature/services/shared/feature_store";
import { applyMovements, round3, type MovementInput } from "../shared/stock_engine";
import { colorKeyOf, nextDocumentNumber } from "../shared/inventory_shared";
import { outgoingMovements } from "../shared/document_lines";
import { documentNumberText } from "../documents/document_shared";

// D4 (Sprint 2, ítem 2): la venta descuenta el stock al marcar la cotización
// como Entregada (o, más adelante, al emitir la guía: lo elige la tienda). Va
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

  const items = await DataBase.instance.quotation_item.findAll({ where: { quotation_id: quotation.id }, attributes: ["product_id", "color", "quantity"], transaction });
  const tracked = await DataBase.instance.product.findAll({
    where: { id: { [Op.in]: items.map((item) => item.product_id) }, tracks_stock: true },
    attributes: ["id"],
    transaction,
  });
  const trackedIds = new Set(tracked.map((product) => Number(product.id)));
  const grouped = new Map<string, { productId: number; color: string; quantity: number }>();
  for (const item of items) {
    if (!trackedIds.has(Number(item.product_id))) continue;
    const color = colorKeyOf(item.color);
    const key = `${item.product_id}|${color}`;
    const current = grouped.get(key) ?? { productId: Number(item.product_id), color, quantity: 0 };
    grouped.set(key, { ...current, quantity: round3(current.quantity + Number(item.quantity)) });
  }
  if (grouped.size === 0) return null;

  const now = nowUtc();
  const { series, number } = await nextDocumentNumber(companyId, "exit", actorId, transaction);
  const document = await DataBase.instance.stock_document.create(
    {
      id: 0,
      company_id: companyId,
      business_unit_id: store.id,
      warehouse_id: warehouse.id,
      target_warehouse_id: null,
      doc_type: "exit",
      reason_code: "sale",
      series,
      number,
      status: "draft",
      document_date: todayInBusinessTz(),
      supplier_id: null,
      client_id: quotation.client_id ?? null,
      quotation_id: quotation.id,
      reversal_of_id: null,
      notes: `Entrega de la cotización #${quotation.id}`,
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
    // confirmar; la entrega y el borrador siguen.
    await DataBase.instance.sequelize.transaction({ transaction }, async (savepoint) => {
      const movements: MovementInput[] = [];
      for (const line of lines) movements.push(...(await outgoingMovements(warehouse, line, Number(line.quantity), savepoint)));
      await applyMovements({ companyId, documentId: Number(document.id), movements, actorId, movementAt: now, transaction: savepoint });
      await document.update({ status: "posted", posted_at: now, posted_by: actorId }, { transaction: savepoint });
    });
    return { documentId: Number(document.id), posted: true };
  } catch (error: unknown) {
    if (!(error instanceof AppError) || (error.code !== "INSUFFICIENT_STOCK" && error.code !== "LOT_EXPIRED")) throw error;
    await document.update(
      { notes: `Entrega de la cotización #${quotation.id}. Sin stock suficiente al entregar: confírmala cuando ingrese.`.slice(0, 500) },
      { transaction }
    );
    if (actorId) {
      await DataBase.instance.reminder.create(
        {
          id: 0,
          company_id: companyId,
          recipient_user_id: actorId,
          title: "Salida de almacén pendiente",
          message: `La cotización #${quotation.id} se entregó pero no había stock suficiente en "${warehouse.name}". La salida ${documentNumberText(document)} quedó en borrador.`.slice(0, 500),
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
