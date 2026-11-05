import { Op, QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";
import { roundMoney } from "../../../../../utils/numbers";
import { computeQuotationTotal } from "../../model/quotation.model";
import { QuotationItemModel } from "../../model/quotation_item.model";
import { CreateQuotationItemInput, priceQuotationItems } from "../create/quotation.service";
import { loadProductVariants, resolveItemVariant, variantsOf } from "../shared/item_variant";
import { getOrderedProductionStages } from "../shared/production_stages";
import { getIgvRate } from "../shared/tax_config";
import { logQuotationEvent } from "../timeline/quotation_event.service";

// `id` = item que ya existe en la cotización; sin `id` es un producto nuevo.
export interface SavedQuotationItemInput extends CreateQuotationItemInput {
  id?: number | null;
}

// Lo que el equipo cambia de una cotización: los items y los datos de cabecera
// que se eligen al cotizar. Cliente, empresa y tienda NO se cambian acá.
export interface SaveQuotationItemsInput {
  items: SavedQuotationItemInput[];
  includes_delivery?: boolean;
  includes_design?: boolean;
  includes_igv?: boolean;
  notes?: string | null;
  production_days?: number | null;
  billing_name?: string | null;
  billing_document_number?: string | null;
}

interface SavedItem {
  input: SavedQuotationItemInput;
  previous: QuotationItemModel | undefined;
  product_id: number;
  technique_id: number | null;
  product_code: string | null;
  color: string | null;
  quantity: number;
  pricing_mode: QuotationItemModel["pricing_mode"];
  unit_price: number;
  subtotal: number;
}

const samePrice = (left: number | null | undefined, right: number | null | undefined) => Number(left ?? 0) === Number(right ?? 0);

// Un item conserva su precio pactado si no cambió lo que lo define: el catálogo
// pudo cambiar después de cotizar y editar otra línea no debe recotizar esta.
const keepsAgreedPrice = (item: SavedQuotationItemInput, previous: QuotationItemModel) => {
  if (Number(previous.product_id) !== Number(item.product_id)) return false;
  if (Number(previous.technique_id ?? 0) !== Number(item.technique_id ?? 0)) return false;
  if (previous.pricing_mode !== item.pricing_mode) return false;
  if (item.pricing_mode !== "custom") return true;
  // El formulario carga un item personalizado con todo el precio en
  // `custom_price` y la técnica en 0 (ver toCompleteFormValues).
  return samePrice(item.custom_price, previous.unit_price) && samePrice(item.custom_technique_price, 0);
};

const hasSameVariant = (item: SavedQuotationItemInput, previous: QuotationItemModel) =>
  (item.color?.trim() || null) === previous.color && (item.product_code?.trim() || null) === previous.product_code;

// Un `id` tiene que ser de ESTA cotización y aparecer una sola vez.
const assertOwnItems = (items: SavedQuotationItemInput[], previousById: Map<number, QuotationItemModel>) => {
  const ids = items.flatMap((item) => (item.id ? [Number(item.id)] : []));
  const isValid = new Set(ids).size === ids.length && ids.every((id) => previousById.has(id));
  if (isValid) return;
  throw new AppError(400, "Uno de los productos ya no pertenece a esta cotización: vuelve a abrirla", undefined, "QUOTATION_ITEM_NOT_FOUND");
};

// El item que pierde su producto (se quita o se cambia por otro) no puede tener
// orden de compra: esa orden se borraría en cascada o quedaría comprando otra
// cosa. Primero se resuelve la compra, nunca se pierde en silencio.
async function assertNoPurchaseOrders(
  affected: QuotationItemModel[],
  productNames: Map<number, string>,
  transaction: Transaction
) {
  if (affected.length === 0) return;
  const linked = await DataBase.instance.purchase_order_item.findOne({
    where: { quotation_item_id: { [Op.in]: affected.map((item) => item.id) } },
    attributes: ["quotation_item_id"],
    transaction,
  });
  if (!linked) return;

  const item = affected.find((row) => Number(row.id) === Number(linked.quotation_item_id));
  const name = productNames.get(Number(item?.product_id)) ?? "este producto";
  throw purchaseOrderConflict(`No se puede quitar ni cambiar "${name}": tiene una orden de compra. Mantén ese producto en la cotización.`);
}

const purchaseOrderConflict = (message: string) => new AppError(409, message, undefined, "QUOTATION_ITEM_HAS_PURCHASE_ORDER");

// Los items sin cambios de precio salen del item guardado; los demás, con las
// reglas completas de crear (empresa, activos, técnica y precio de catálogo).
async function priceSavedItems({
  items,
  previousById,
  productNames,
  companyId,
  transaction,
}: {
  items: SavedQuotationItemInput[];
  previousById: Map<number, QuotationItemModel>;
  productNames: Map<number, string>;
  companyId: number;
  transaction: Transaction;
}): Promise<SavedItem[]> {
  const previousOf = (item: SavedQuotationItemInput) => (item.id ? previousById.get(Number(item.id)) : undefined);
  const changed = items.filter((item) => {
    const previous = previousOf(item);
    return !previous || !keepsAgreedPrice(item, previous);
  });
  const priced = changed.length > 0 ? await priceQuotationItems({ items: changed, companyId, transaction }) : { items: [] };
  const pricedByInput = new Map(changed.map((item, index) => [item, priced.items[index]]));
  const variants = await loadProductVariants(items.map((item) => Number(item.product_id)));

  return items.map((item) => {
    const previous = previousOf(item);
    const pricedItem = pricedByInput.get(item);
    if (pricedItem) {
      return {
        input: item,
        previous,
        product_id: pricedItem.product_id,
        technique_id: pricedItem.technique_id ?? null,
        product_code: pricedItem.product_code ?? null,
        color: pricedItem.color ?? null,
        quantity: pricedItem.quantity,
        pricing_mode: pricedItem.pricing_mode,
        unit_price: pricedItem.unit_price,
        subtotal: pricedItem.subtotal,
      };
    }

    // `pricedItem` solo falta en un item existente con su precio pactado.
    const kept = previous as QuotationItemModel;
    const variant = hasSameVariant(item, kept)
      ? { product_code: kept.product_code, color: kept.color }
      : resolveItemVariant({
          productName: productNames.get(Number(kept.product_id)) ?? "seleccionado",
          requestedCode: item.product_code,
          requestedColor: item.color,
          variants: variantsOf(variants, Number(kept.product_id)),
        });
    const unitPrice = Number(kept.unit_price);
    const quantity = Number(item.quantity);
    return {
      input: item,
      previous: kept,
      product_id: Number(kept.product_id),
      technique_id: kept.technique_id,
      ...variant,
      quantity,
      pricing_mode: kept.pricing_mode,
      unit_price: unitPrice,
      subtotal: roundMoney(unitPrice * quantity),
    };
  });
}

const isModified = (item: SavedItem) => {
  const { previous } = item;
  if (!previous) return false;
  return (
    Number(previous.product_id) !== item.product_id ||
    Number(previous.technique_id ?? 0) !== Number(item.technique_id ?? 0) ||
    previous.product_code !== item.product_code ||
    previous.color !== item.color ||
    Number(previous.quantity) !== item.quantity ||
    previous.pricing_mode !== item.pricing_mode ||
    !samePrice(previous.unit_price, item.unit_price)
  );
};

// Aplica la diferencia: nunca se borra todo y se recrea, porque un item existente
// tiene etapa de producción, autor y órdenes de compra ligadas a su id.
async function applyItemChanges({
  quotationId,
  companyId,
  saved,
  removed,
  updatedBy,
  transaction,
}: {
  quotationId: number;
  companyId: number;
  saved: SavedItem[];
  removed: QuotationItemModel[];
  updatedBy: number;
  transaction: Transaction;
}) {
  const now = nowUtc();
  const modified = saved.filter(isModified);
  const added = saved.filter((item) => !item.previous);

  if (removed.length > 0) {
    await DataBase.instance.quotation_item.destroy({ where: { id: { [Op.in]: removed.map((item) => item.id) } }, transaction });
  }

  if (modified.length > 0) {
    // Una sola consulta (ON DUPLICATE KEY): etapa y autor no se tocan.
    await DataBase.instance.quotation_item.bulkCreate(
      modified.map((item) => ({
        ...(item.previous as QuotationItemModel).get({ plain: true }),
        product_id: item.product_id,
        technique_id: item.technique_id,
        product_code: item.product_code,
        color: item.color,
        quantity: item.quantity,
        pricing_mode: item.pricing_mode,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        updated_by: updatedBy,
        updated_at: now,
      })),
      {
        updateOnDuplicate: [
          "product_id",
          "technique_id",
          "product_code",
          "color",
          "quantity",
          "pricing_mode",
          "unit_price",
          "subtotal",
          "updated_by",
          "updated_at",
        ],
        transaction,
      }
    );
  }

  if (added.length > 0) {
    const stages = await getOrderedProductionStages(companyId, transaction);
    const firstStageId = stages[0]?.id ?? null;
    await DataBase.instance.quotation_item.bulkCreate(
      added.map((item) => ({
        id: 0,
        quotation_id: quotationId,
        product_id: item.product_id,
        technique_id: item.technique_id,
        stage_id: firstStageId,
        product_code: item.product_code,
        color: item.color,
        quantity: item.quantity,
        pricing_mode: item.pricing_mode,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        created_by: updatedBy,
        created_at: now,
        updated_by: updatedBy,
        updated_at: now,
      })),
      { transaction }
    );
  }

  return { added: added.length, modified: modified.length, removed: removed.length, now };
}

/**
 * Guarda los productos y datos de una cotización, en CUALQUIER estado (pedido
 * explícito del usuario: "toda cotización debe poder editarse"). Con las mismas
 * reglas de crear para lo nuevo, y sin descuadrar lo ya hecho:
 * - un item existente conserva su etapa, sus compras y su precio pactado;
 * - un item con orden de compra no se puede quitar ni cambiar de producto;
 * - el total nunca queda por debajo de lo ya cobrado.
 * Todo en una transacción: o queda todo guardado, o queda como estaba.
 */
export async function saveQuotationItems({
  quotationId,
  input,
  updatedBy,
}: {
  quotationId: number;
  input: SaveQuotationItemsInput;
  updatedBy: number;
}) {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // Lock: serializa contra un pago o un cambio de estado simultáneo.
    const quotation = await DataBase.instance.quotation.findOne({
      where: { id: quotationId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!quotation) throw new AppError(404, "La cotización no existe");

    const previousItems = await DataBase.instance.quotation_item.findAll({
      where: { quotation_id: quotationId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const previousById = new Map(previousItems.map((item) => [Number(item.id), item]));
    assertOwnItems(input.items, previousById);

    const products = await DataBase.instance.product.findAll({
      where: { id: { [Op.in]: previousItems.map((item) => item.product_id) } },
      attributes: ["id", "name"],
      transaction,
    });
    const productNames = new Map(products.map((product) => [Number(product.id), product.name]));

    const keptIds = new Set(input.items.flatMap((item) => (item.id ? [Number(item.id)] : [])));
    const removed = previousItems.filter((item) => !keptIds.has(Number(item.id)));
    const productChanged = input.items.flatMap((item) => {
      const previous = item.id ? previousById.get(Number(item.id)) : undefined;
      return previous && Number(previous.product_id) !== Number(item.product_id) ? [previous] : [];
    });
    await assertNoPurchaseOrders([...removed, ...productChanged], productNames, transaction);

    const saved = await priceSavedItems({
      items: input.items,
      previousById,
      productNames,
      companyId: quotation.company_id,
      transaction,
    });
    const subtotal = roundMoney(saved.reduce((sum, item) => sum + item.subtotal, 0));
    const includesIgv = input.includes_igv ?? quotation.includes_igv;
    const igvRate = await getIgvRate(quotation.company_id);
    const total = roundMoney(computeQuotationTotal(subtotal, Boolean(includesIgv), igvRate));

    const totalPaid = Number(quotation.total_paid);
    if (totalPaid > total) {
      throw new AppError(
        400,
        `No se puede guardar: el cliente ya pagó S/ ${totalPaid.toFixed(2)} y el nuevo total sería S/ ${total.toFixed(2)}. Corrige los pagos primero.`,
        undefined,
        "TOTAL_BELOW_PAID"
      );
    }

    const changes = await applyItemChanges({
      quotationId,
      companyId: quotation.company_id,
      saved,
      removed,
      updatedBy,
      transaction,
    });

    await DataBase.instance.quotation.update(
      {
        subtotal,
        total,
        includes_igv: Boolean(includesIgv),
        includes_delivery: input.includes_delivery ?? quotation.includes_delivery,
        includes_design: input.includes_design ?? quotation.includes_design,
        notes: input.notes === undefined ? quotation.notes : input.notes,
        production_days: input.production_days === undefined ? quotation.production_days : input.production_days,
        billing_name: input.billing_name === undefined ? quotation.billing_name : input.billing_name,
        billing_document_number:
          input.billing_document_number === undefined ? quotation.billing_document_number : input.billing_document_number,
        updated_by: updatedBy,
        updated_at: changes.now,
      },
      { where: { id: quotationId }, transaction }
    );

    const previousTotal = Number(quotation.total).toFixed(2);
    await logQuotationEvent({
      quotationId,
      action: "updated",
      description:
        quotation.status === "quote_requested"
          ? `Se completaron los productos de la cotización (${saved.length} producto(s), total S/ ${total.toFixed(2)})`
          : `Se editó la cotización: total S/ ${previousTotal} → S/ ${total.toFixed(2)} (${changes.added} agregado(s), ${changes.modified} modificado(s), ${changes.removed} quitado(s))`,
      actorId: updatedBy,
      transaction,
    });

    return { id: quotationId, subtotal, total, items_count: saved.length };
  });
}

interface IncompleteItemRow {
  product_name: string;
  requires_customization: number | boolean;
  technique_id: number | null;
  unit_price: string | number;
}

// Antes de pasar de "Pendiente de cotizar" a "Pendiente" (= se le envía al
// cliente), la cotización tiene que estar cotizada de verdad: al menos un
// producto, técnica donde el producto la requiere y precio en cada item. Lo
// que llega de la web puede venir sin técnica ni precio.
export async function assertRequestedQuotationIsComplete(quotationId: number, transaction: Transaction) {
  const rows = (await DataBase.instance.sequelize.query(
    `SELECT p.name AS product_name, p.requires_customization, qi.technique_id, qi.unit_price
     FROM quotation_item qi
     INNER JOIN product p ON p.id = qi.product_id
     WHERE qi.quotation_id = :quotationId`,
    { type: QueryTypes.SELECT, replacements: { quotationId }, transaction }
  )) as IncompleteItemRow[];

  if (rows.length === 0) {
    throw new AppError(409, "La cotización no tiene productos: complétala antes de pasarla a Pendiente", undefined, "QUOTATION_INCOMPLETE");
  }

  const missingTechnique = rows.find((row) => Boolean(row.requires_customization) && !row.technique_id);
  if (missingTechnique) {
    throw new AppError(
      409,
      `Falta la técnica de personalización de "${missingTechnique.product_name}": completa la cotización antes de pasarla a Pendiente`,
      undefined,
      "QUOTATION_INCOMPLETE"
    );
  }

  const missingPrice = rows.find((row) => Number(row.unit_price) <= 0);
  if (missingPrice) {
    throw new AppError(
      409,
      `"${missingPrice.product_name}" no tiene precio: completa la cotización antes de pasarla a Pendiente`,
      undefined,
      "QUOTATION_INCOMPLETE"
    );
  }
}
