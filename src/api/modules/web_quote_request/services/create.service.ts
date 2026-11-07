import { DataBase } from "../../../../database";
import { nowUtc } from "../../../../utils/dateUtils";
import { roundMoney } from "../../../../utils/numbers";
import { ApiKeyContext } from "../../api_key/types/api_key.types";
import { computeQuotationTotal } from "../../quotation/model/quotation.model";
import { getOrderedProductionStages } from "../../quotation/services/shared/production_stages";
import { getIgvRate } from "../../quotation/services/shared/tax_config";
import { logQuotationEvent } from "../../quotation/services/timeline/quotation_event.service";
import { WebQuoteAddedItem, WebQuoteRequestInput, WebQuoteRequestResult } from "../types/web_quote_request.types";
import { suggestDraftPricing } from "./shared/draft_pricing";
import { describeBelowMinimum, isBelowMinOrder, minOrderOf } from "./shared/min_order";
import { describeMissingItems, notifyMissingProducts } from "./shared/notify_missing_products";
import { resolveWebClient } from "./shared/resolve_client";
import { loadWebCatalog, resolveWebItems } from "./shared/resolve_items";

// Crea una cotización "Pendiente de cotizar" con lo que eligió el cliente en
// la web. Empresa y tienda salen de la API key (nunca del body). Todo en una
// transacción: cliente nuevo, cotización, items, timeline y avisos quedan
// juntos o no queda nada.
export async function createWebQuoteRequestService(
  input: WebQuoteRequestInput,
  apiKey: ApiKeyContext
): Promise<WebQuoteRequestResult> {
  const { companyId, businessUnitId } = apiKey;

  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const { client, created, warnings } = await resolveWebClient({
      input: input.client,
      companyId,
      businessUnitId,
      transaction,
    });

    const catalog = await loadWebCatalog(input.items, companyId, transaction);
    const { resolved, missingItems, variantIssues } = resolveWebItems(input.items, catalog);
    const found = resolved.map((item) => ({ item, product: item.product, pricing: suggestDraftPricing(item.product, item.quantity) }));

    // IGV activo por defecto (pedido explícito del usuario): el equipo puede
    // quitarlo al completarla.
    const subtotal = roundMoney(found.reduce((sum, entry) => sum + entry.pricing.subtotal, 0));
    const total = computeQuotationTotal(subtotal, true, await getIgvRate(companyId));
    const now = nowUtc();

    const quotation = await DataBase.instance.quotation.create(
      {
        id: 0,
        company_id: companyId,
        business_unit_id: businessUnitId,
        client_id: client.id,
        status: "quote_requested",
        status_changed_at: now,
        subtotal,
        total,
        total_paid: 0,
        includes_delivery: false,
        includes_design: false,
        includes_igv: true,
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
        product_code: item.code,
        color: item.color,
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
      variantIssues,
      issuedBy: apiKey.issuedBy,
      transaction,
    });

    // El Historial deja constancia de los SKU faltantes y de si alguien
    // recibió el aviso (si no, queda a la vista que nadie fue notificado).
    const pendingNotes = [
      ...(missingItems.length > 0 ? [`No existen en el catálogo: ${describeMissingItems(missingItems)}.`] : []),
      ...(variantIssues.length > 0 ? [`Revisar color: ${variantIssues.join("; ")}.`] : []),
    ];
    const missingNote =
      pendingNotes.length > 0
        ? ` ${pendingNotes.join(" ")} ` +
          (notifiedCount > 0 ? `Se avisó a ${notifiedCount} usuario(s).` : "No había ningún usuario a quien avisar.")
        : "";
    // Pedido mínimo (decisión del usuario): el item entra igual y queda
    // marcado en la respuesta y en el Historial para que el equipo lo revise.
    const belowMinimum = found.filter(({ item }) => isBelowMinOrder(item.product, item.quantity));
    const belowMinimumNote =
      belowMinimum.length > 0 ? ` Debajo del pedido mínimo: ${belowMinimum.map(({ item }) => describeBelowMinimum(item)).join("; ")}.` : "";
    await logQuotationEvent({
      quotationId: quotation.id,
      action: "created",
      description: `Pedido recibido desde la web (${apiKey.name}) con ${found.length} producto(s).${missingNote}${belowMinimumNote}`,
      actorId: undefined,
      transaction,
    });

    const itemsAdded: WebQuoteAddedItem[] = found.map(({ item, product }) => ({
      sku: product.sku,
      code: item.code,
      color: item.color,
      product_id: product.id,
      product_name: product.name,
      quantity: item.quantity,
      min_order_quantity: minOrderOf(product),
      below_min_order: isBelowMinOrder(product, item.quantity),
    }));

    return {
      quotation_id: quotation.id,
      status: "quote_requested",
      client_id: client.id,
      client_created: created,
      items_added: itemsAdded,
      missing_items: missingItems,
      warnings: [
        ...warnings,
        ...variantIssues,
        ...belowMinimum.map(({ item }) => `Debajo del pedido mínimo: ${describeBelowMinimum(item)}`),
      ],
    };
  });
}
