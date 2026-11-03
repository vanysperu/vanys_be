import { DataBase } from "../../../../database";
import { nowUtc } from "../../../../utils/dateUtils";
import { roundMoney } from "../../../../utils/numbers";
import { ApiKeyContext } from "../../api_key/types/api_key.types";
import { getOrderedProductionStages } from "../../quotation/services/shared/production_stages";
import { logQuotationEvent } from "../../quotation/services/timeline/quotation_event.service";
import {
  WebQuoteAddedItem,
  WebQuoteItemInput,
  WebQuoteMissingItem,
  WebQuoteRequestInput,
  WebQuoteRequestResult,
} from "../types/web_quote_request.types";
import { suggestDraftPricing } from "./shared/draft_pricing";
import { describeMissingItems, notifyMissingProducts } from "./shared/notify_missing_products";
import { findProductsBySku, skuKey } from "./shared/products_by_sku";
import { resolveWebClient } from "./shared/resolve_client";

// Un mismo SKU repetido en el carrito se suma en un solo item.
const mergeItemsBySku = (items: WebQuoteItemInput[]): WebQuoteItemInput[] => {
  const merged = new Map<string, WebQuoteItemInput>();
  for (const item of items) {
    const key = skuKey(item.sku);
    const previous = merged.get(key);
    merged.set(key, { sku: item.sku.trim(), quantity: (previous?.quantity ?? 0) + item.quantity });
  }
  return [...merged.values()];
};

// Crea una cotización "Pendiente de cotizar" con lo que eligió el cliente en
// la web. Empresa y tienda salen de la API key (nunca del body). Todo en una
// transacción: cliente nuevo, cotización, items, timeline y avisos quedan
// juntos o no queda nada.
export async function createWebQuoteRequestService(
  input: WebQuoteRequestInput,
  apiKey: ApiKeyContext
): Promise<WebQuoteRequestResult> {
  const { companyId, businessUnitId } = apiKey;
  const requestedItems = mergeItemsBySku(input.items);

  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const { client, created, warnings } = await resolveWebClient({
      input: input.client,
      companyId,
      businessUnitId,
      transaction,
    });

    const productsBySku = await findProductsBySku(
      requestedItems.map((item) => item.sku),
      companyId,
      transaction
    );

    const found = requestedItems.flatMap((item) => {
      const product = productsBySku.get(skuKey(item.sku));
      return product ? [{ item, product, pricing: suggestDraftPricing(product, item.quantity) }] : [];
    });
    const missingItems: WebQuoteMissingItem[] = requestedItems.filter((item) => !productsBySku.has(skuKey(item.sku)));

    // Borrador sin IGV: el equipo lo define al completarla.
    const subtotal = roundMoney(found.reduce((sum, entry) => sum + entry.pricing.subtotal, 0));
    const now = nowUtc();

    const quotation = await DataBase.instance.quotation.create(
      {
        id: 0,
        company_id: companyId,
        business_unit_id: businessUnitId,
        client_id: client.id,
        status: "quote_requested",
        subtotal,
        total: subtotal,
        total_paid: 0,
        includes_delivery: false,
        includes_design: false,
        includes_igv: false,
        notes: null,
        // Sin vigencia mientras no se le envíe al cliente: se calcula al
        // pasarla a Pendiente (ver changeQuotationStatus).
        valid_until: null,
        billing_name: null,
        billing_document_number: null,
        production_days: null,
        is_deleted: false,
        // La crea la integración, no un usuario del sistema.
        created_by: null,
        created_at: now,
        updated_by: null,
        updated_at: null,
      },
      { transaction }
    );

    const stages = await getOrderedProductionStages(companyId, transaction);
    const firstStageId = stages[0]?.id ?? null;
    await DataBase.instance.quotation_item.bulkCreate(
      found.map(({ item, product, pricing }) => ({
        id: 0,
        quotation_id: quotation.id,
        product_id: product.id,
        technique_id: null,
        stage_id: firstStageId,
        quantity: item.quantity,
        pricing_mode: pricing.pricing_mode,
        unit_price: pricing.unit_price,
        subtotal: pricing.subtotal,
        created_by: null,
        created_at: now,
      })),
      { transaction }
    );

    const notifiedCount = await notifyMissingProducts({
      companyId,
      quotationId: quotation.id,
      clientLabel: `${client.name}, cel. ${client.phone ?? input.client.phone}`,
      missingItems,
      issuedBy: apiKey.issuedBy,
      transaction,
    });

    // El Historial deja constancia de los SKU faltantes y de si alguien
    // recibió el aviso (si no, queda a la vista que nadie fue notificado).
    const missingNote =
      missingItems.length > 0
        ? ` No existen en el catálogo: ${describeMissingItems(missingItems)}. ` +
          (notifiedCount > 0 ? `Se avisó a ${notifiedCount} usuario(s).` : "No había ningún usuario a quien avisar.")
        : "";
    await logQuotationEvent({
      quotationId: quotation.id,
      action: "created",
      description: `Pedido recibido desde la web (${apiKey.name}) con ${found.length} producto(s).${missingNote}`,
      actorId: undefined,
      transaction,
    });

    const itemsAdded: WebQuoteAddedItem[] = found.map(({ item, product }) => ({
      sku: item.sku,
      product_id: product.id,
      product_name: product.name,
      quantity: item.quantity,
    }));

    return {
      quotation_id: quotation.id,
      status: "quote_requested",
      client_id: client.id,
      client_created: created,
      items_added: itemsAdded,
      missing_items: missingItems,
      warnings,
    };
  });
}
