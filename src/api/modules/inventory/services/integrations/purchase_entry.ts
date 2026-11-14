import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc, todayInBusinessTz } from "../../../../../utils/dateUtils";
import { applyMovements, round3 } from "../shared/stock_engine";
import { assertCompanyHasInventory, colorKeyOf, nextDocumentNumber } from "../shared/inventory_shared";
import { resolveEntryLots } from "../shared/document_lines";
import { documentNumberText } from "../documents/document_shared";

// Plan §8.4: al registrar una compra se puede "Ingresar al almacén X". Crea un
// ingreso confirmado (motivo compra) en la misma transacción de la compra; el
// costo unitario es el monto entre la cantidad (alimenta el promedio, D3).
export const createPurchaseEntry = async ({
  companyId,
  warehouseId,
  productId,
  color,
  quantity,
  amount,
  note,
  lotCode = null,
  expiryDate = null,
  actorId,
  transaction,
}: {
  companyId: number;
  warehouseId: number;
  productId: number;
  color: string | null;
  quantity: number;
  amount: number;
  note: string;
  // Almacén con lotes: código del lote (sin código se genera) y vencimiento
  // (obligatorio si el almacén controla vencimientos y el producto es perecible).
  lotCode?: string | null;
  expiryDate?: string | null;
  actorId: number | null;
  transaction: Transaction;
}): Promise<number> => {
  await assertCompanyHasInventory(companyId);
  const warehouse = await DataBase.instance.warehouse.findOne({ where: { id: warehouseId, company_id: companyId, is_transit: false }, transaction });
  if (!warehouse || !warehouse.active) throw new AppError(400, "El almacén no existe o está deshabilitado");
  const product = await DataBase.instance.product.findOne({ where: { id: productId, company_id: companyId }, attributes: ["id", "name", "tracks_stock"], transaction });
  if (!product?.tracks_stock) throw new AppError(400, `"${product?.name ?? "El producto"}" no maneja stock: no se puede ingresar al almacén`);

  const now = nowUtc();
  const { series, number } = await nextDocumentNumber(companyId, "entry", actorId, transaction);
  const document = await DataBase.instance.stock_document.create(
    {
      id: 0,
      company_id: companyId,
      business_unit_id: warehouse.business_unit_id,
      warehouse_id: warehouse.id,
      target_warehouse_id: null,
      doc_type: "entry",
      reason_code: "purchase",
      series,
      number,
      status: "posted",
      document_date: todayInBusinessTz(),
      supplier_id: null,
      client_id: null,
      quotation_id: null,
      reversal_of_id: null,
      notes: note.slice(0, 500),
      posted_at: now,
      posted_by: actorId,
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
  const unitCost = quantity > 0 ? Math.round((amount / quantity) * 10000) / 10000 : 0;
  const line = await DataBase.instance.stock_document_line.create(
    {
      id: 0,
      company_id: companyId,
      document_id: document.id,
      product_id: productId,
      color_key: colorKeyOf(color),
      lot_id: null,
      lot_code: lotCode?.trim() ? lotCode.trim().slice(0, 60) : null,
      expiry_date: expiryDate,
      quantity: String(round3(quantity)),
      received_quantity: null,
      unit_cost: String(unitCost),
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    },
    { transaction }
  );
  const lots = await resolveEntryLots(companyId, warehouse, [line], documentNumberText(document), actorId, transaction);
  await applyMovements({
    companyId,
    documentId: Number(document.id),
    movements: [
      {
        warehouseId: Number(warehouse.id),
        productId,
        colorKey: line.color_key,
        lotKey: lots.get(Number(line.id)) ?? 0,
        quantity: round3(quantity),
        unitCost,
        documentLineId: Number(line.id),
      },
    ],
    actorId,
    movementAt: now,
    transaction,
  });
  return Number(document.id);
};
