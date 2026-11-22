import { IToken } from "../../../interfaces/IToken.interface";
import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { fromCents, toCents } from "../../../../core/utils/money";
import { todayInBusinessTz } from "../../../../utils/dateUtils";
import { createQuotation } from "../../quotation/services/create/quotation.service";
import { changeQuotationStatus } from "../../quotation/services/update/quotation.service";
import { QuotationStatus } from "../../quotation/model/quotation.model";
import { createPurchaseOrder } from "../../purchase_order/services/create/purchase_order.service";
import { createPurchaseOrderItemPurchase } from "../../purchase_order/services/create/purchase_order_item_purchase.service";
import { createWarehouseService } from "../../inventory/services/warehouses/create_warehouse.service";
import { hasCompanyFeature } from "../../company_feature/services/shared/feature_store";
import { LessonPreparation, PreparedLessonResult } from "../types/tutorial.types";
import { assertPracticeSession } from "./shared/practice_owner.service";

const PRACTICE_QUANTITY = 50;
// Lo que "costó" la compra de práctica (para facturas y deudas a personal).
const PRACTICE_PURCHASE_AMOUNT = 300;
// Pasos para llegar a "Lista para entregar" desde Aceptada (uno por uno, como en el sistema).
const TO_READY: QuotationStatus[] = ["design_pending", "in_process", "ready"];

// POST /tutorial/practice/prepare: deja listos los datos que necesita una
// lección (una cotización pendiente o aceptada, una orden de compra, una compra
// con factura pendiente o pagada con plata propia, una cotización lista para
// entregar, un almacén). Así cada lección se puede hacer en cualquier orden y
// repetir. Solo dentro de la empresa de práctica y con los servicios normales
// del sistema (cada uno con su propia transacción, se llaman uno tras otro).
export const prepareLessonService = async (user: IToken, preparation: LessonPreparation): Promise<PreparedLessonResult> => {
  const companyId = await assertPracticeSession(user);
  if (preparation === "warehouse") {
    await ensureWarehouse(companyId, user);
    return { quotation_id: null };
  }

  const quotationId = await createPracticeQuotation(companyId, user);
  if (preparation === "pending_quotation") return { quotation_id: quotationId };

  await acceptWithAdvance(quotationId, user);
  if (preparation === "accepted_quotation") return { quotation_id: quotationId };

  if (preparation === "ready_quotation") {
    for (const status of TO_READY) {
      await changeQuotationStatus({ quotationId, nextStatus: status, updatedBy: user.userId });
    }
    return { quotation_id: quotationId };
  }

  const itemId = await createPracticePurchaseOrder(companyId, quotationId, user);
  if (preparation === "purchase_order") return { quotation_id: quotationId };

  // Compra ya hecha: con la factura por llegar, o pagada por la persona con su plata.
  await createPurchaseOrderItemPurchase({
    itemId,
    quantity: PRACTICE_QUANTITY,
    amount: PRACTICE_PURCHASE_AMOUNT,
    notes: "Compra de práctica",
    ...(preparation === "pending_invoice_purchase"
      ? { fundingSource: "company" as const, invoicePending: true }
      : { fundingSource: "employee" as const, paidByUserId: user.userId }),
    createdBy: user.userId,
  });
  return { quotation_id: quotationId };
};

const createPracticeQuotation = async (companyId: number, user: IToken): Promise<number> => {
  const active = { company_id: companyId, is_deleted: false };
  const [client, product, technique] = await Promise.all([
    DataBase.instance.client.findOne({ where: active, order: [["id", "ASC"]] }),
    DataBase.instance.product.findOne({ where: { ...active, requires_customization: true }, order: [["id", "ASC"]] }),
    DataBase.instance.customization_technique.findOne({ where: active, order: [["id", "ASC"]] }),
  ]);
  if (!client || !product || !technique) {
    throw new AppError(
      409,
      "Faltan los ejemplos de la empresa de práctica: reiníciala desde Aprender",
      undefined,
      "PRACTICE_SAMPLES_MISSING"
    );
  }
  const quotation = await createQuotation({
    input: {
      company_id: companyId,
      business_unit_id: user.businessUnitId ?? null,
      client_id: Number(client.id),
      includes_igv: true,
      items: [{ product_id: Number(product.id), technique_id: Number(technique.id), quantity: PRACTICE_QUANTITY, pricing_mode: "unit" }],
    },
    createdBy: user.userId,
  });
  return Number(quotation.id);
};

// Aceptada con la mitad de adelanto en efectivo, como lo haría el equipo.
const acceptWithAdvance = async (quotationId: number, user: IToken) => {
  const quotation = await DataBase.instance.quotation.findByPk(quotationId, { attributes: ["id", "total"] });
  if (!quotation) throw new AppError(404, "No se encontró la cotización de práctica");
  await changeQuotationStatus({
    quotationId,
    nextStatus: "accepted",
    updatedBy: user.userId,
    advancePayment: {
      amount: fromCents(Math.round(toCents(quotation.total) / 2)),
      method: "cash",
      paid_at: todayInBusinessTz(),
      notes: "Adelanto (práctica)",
    },
  });
};

// Orden de compra del pedido, encargada a la misma persona. Devuelve el ítem.
const createPracticePurchaseOrder = async (companyId: number, quotationId: number, user: IToken): Promise<number> => {
  const quotationItem = await DataBase.instance.quotation_item.findOne({ where: { quotation_id: quotationId }, order: [["id", "ASC"]] });
  if (!quotationItem) throw new AppError(404, "La cotización de práctica no tiene productos");
  const order = await createPurchaseOrder({
    input: {
      company_id: companyId,
      quotation_id: quotationId,
      assigned_to: user.userId,
      notes: "Orden de práctica",
      items: [{ quotation_item_id: Number(quotationItem.id), quantity: PRACTICE_QUANTITY }],
    },
    createdBy: user.userId,
  });
  const orderItem = await DataBase.instance.purchase_order_item.findOne({ where: { purchase_order_id: order.id } });
  if (!orderItem) throw new AppError(500, "No se pudo preparar la orden de compra de práctica");
  return Number(orderItem.id);
};

// Un almacén en la tienda de práctica (un gestor no puede crearlos, pero sí
// mover stock). Solo si la empresa tiene inventario y todavía no hay uno.
const ensureWarehouse = async (companyId: number, user: IToken) => {
  if (!(await hasCompanyFeature(companyId, "inventory"))) {
    throw new AppError(409, "Tu empresa no tiene inventario", undefined, "FEATURE_DISABLED");
  }
  const storeId = user.businessUnitId;
  if (!storeId) throw new AppError(409, "Tu usuario de práctica no tiene tienda", undefined, "PRACTICE_WITHOUT_STORE");
  const existing = await DataBase.instance.warehouse.count({ where: { business_unit_id: storeId, active: true } });
  if (existing > 0) return;
  await createWarehouseService(
    companyId,
    {
      business_unit_id: storeId,
      code: "PRIN",
      name: "Almacén principal",
      allow_negative_stock: false,
      track_lots: false,
      track_expiry: false,
      expiry_alert_days: 30,
      block_expired: false,
      is_default: true,
    },
    user
  );
};
