import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc, toDateOnlyString, toBusinessDateOnly } from "../../../../../utils/dateUtils";
import { AppError } from "../../../../../core/errors/AppError";
import { quotationCode } from "../../../invoice/services/shared/drive_copy";
import { QUOTATION_STATUS_LABEL, QuotationStatus } from "../../model/quotation.model";
import { QuotationPublicLinkModel } from "../../model/quotation_public_link.model";
import { allocateIgvByLine } from "../shared/igv_breakdown";
import { loadQuotationBranding, parseTermsLines } from "../shared/quotation_branding";
import { logQuotationEvent } from "../timeline/quotation_event.service";

// Lo que ve el cliente en /c/<código> (Sprint 2, ítem 7). EXACTAMENTE lo que ya
// muestra el PDF: nunca costos, ganancia, gastos, compras, pagos internos,
// historial ni notas internas. La prueba de la API compara estas claves.
export interface PublicQuotationView {
  code: string;
  status: QuotationStatus;
  statusLabel: string;
  // Fechas de Lima en "YYYY-MM-DD".
  createdAt: string;
  validUntil: string | null;
  productionDays: number | null;
  includesIgv: boolean;
  includesDelivery: boolean;
  includesDesign: boolean;
  client: { name: string; documentNumber: string | null };
  billingName: string | null;
  billingDocumentNumber: string | null;
  items: {
    id: number;
    productName: string;
    sku: string | null;
    color: string | null;
    productCode: string | null;
    techniqueName: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    igv: number;
    total: number;
  }[];
  subtotal: number;
  igv: number;
  total: number;
  notes: string | null;
  company: {
    name: string;
    ruc: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    logoUrl: string | null;
    brandColor: string;
    terms: string[];
  };
  store: { code: string; address: string | null } | null;
  paymentAccounts: { id: number; type: string; name: string; number: string | null; qrUrl: string | null }[];
}

interface ItemRow {
  id: number | string;
  color: string | null;
  product_code: string | null;
  quantity: number;
  unit_price: number | string;
  subtotal: number | string;
  product?: { name: string; sku: string | null } | null;
  technique?: { name: string } | null;
}

interface QuotationRow {
  id: number | string;
  company_id: number;
  status: QuotationStatus;
  created_at: Date;
  valid_until: string | Date | null;
  production_days: number | null;
  includes_igv: boolean;
  includes_delivery: boolean;
  includes_design: boolean;
  billing_name: string | null;
  billing_document_number: string | null;
  subtotal: number | string;
  total: number | string;
  notes: string | null;
  client?: { name: string; document_number: string | null } | null;
  businessUnit?: { business_code: string; address: string | null } | null;
  items?: ItemRow[];
}

/** Enlace vigente (existe y está encendido); si no, 404 sin decir por qué. */
export async function findEnabledPublicLink(code: string): Promise<QuotationPublicLinkModel> {
  const link = await DataBase.instance.quotation_public_link.findOne({ where: { code, enabled: true } });
  if (!link) throw new AppError(404, "Esta cotización ya no está disponible", undefined, "PUBLIC_QUOTATION_UNAVAILABLE");
  return link;
}

// Cuenta la vista; la primera queda en el historial ("La abrió el cliente").
async function registerView(link: QuotationPublicLinkModel): Promise<void> {
  const now = nowUtc();
  const [firstTime] = await DataBase.instance.quotation_public_link.update(
    { first_viewed_at: now },
    { where: { id: link.id, first_viewed_at: { [Op.is]: null } } }
  );
  await DataBase.instance.quotation_public_link.increment("view_count", { by: 1, where: { id: link.id } });
  await DataBase.instance.quotation_public_link.update({ last_viewed_at: now }, { where: { id: link.id } });
  if (firstTime === 1) {
    await logQuotationEvent({
      quotationId: Number(link.quotation_id),
      action: "viewed_by_client",
      description: "El cliente abrió la cotización por primera vez",
    });
  }
}

export async function getPublicQuotationView(code: string): Promise<PublicQuotationView> {
  const link = await findEnabledPublicLink(code);
  const quotation = (await DataBase.instance.quotation.findOne({
    where: { id: link.quotation_id, is_deleted: false },
    include: [
      { association: "client", attributes: ["name", "document_number"] },
      { association: "businessUnit", attributes: ["business_code", "address"] },
      {
        association: "items",
        separate: true,
        order: [["id", "ASC"]],
        include: [
          { association: "product", attributes: ["name", "sku"] },
          { association: "technique", attributes: ["name"] },
        ],
      },
    ],
  })) as unknown as QuotationRow | null;
  // Una cotización incompleta (pedido de la web) tampoco se muestra.
  if (!quotation || quotation.status === "quote_requested") {
    throw new AppError(404, "Esta cotización ya no está disponible", undefined, "PUBLIC_QUOTATION_UNAVAILABLE");
  }

  const branding = await loadQuotationBranding(quotation.company_id);
  const subtotal = Number(quotation.subtotal);
  const total = Number(quotation.total);
  const igvTotal = quotation.includes_igv ? total - subtotal : 0;
  const items = allocateIgvByLine(quotation.items ?? [], igvTotal).map(({ line, amounts }) => ({
    id: Number(line.id),
    productName: line.product?.name ?? "Producto",
    sku: line.product?.sku ?? null,
    color: line.color,
    productCode: line.product_code,
    techniqueName: line.technique?.name ?? null,
    quantity: Number(line.quantity),
    unitPrice: Number(line.unit_price),
    subtotal: amounts.subtotal,
    igv: amounts.igv,
    total: amounts.total,
  }));

  await registerView(link);

  const company = branding.company;
  return {
    code: quotationCode(Number(quotation.id)),
    status: quotation.status,
    statusLabel: QUOTATION_STATUS_LABEL[quotation.status],
    createdAt: toBusinessDateOnly(quotation.created_at),
    validUntil: quotation.valid_until ? toDateOnlyString(quotation.valid_until) : null,
    productionDays: quotation.production_days,
    includesIgv: Boolean(quotation.includes_igv),
    includesDelivery: Boolean(quotation.includes_delivery),
    includesDesign: Boolean(quotation.includes_design),
    client: { name: quotation.client?.name ?? "", documentNumber: quotation.client?.document_number ?? null },
    billingName: quotation.billing_name,
    billingDocumentNumber: quotation.billing_document_number,
    items,
    subtotal,
    igv: igvTotal,
    total,
    notes: quotation.notes,
    company: {
      name: company?.business_name ?? "",
      ruc: company?.ruc ?? null,
      address: company?.address ?? null,
      phone: company?.phone ?? null,
      email: company?.email ?? null,
      logoUrl: company?.logo_url ?? null,
      brandColor: branding.brandColor,
      terms: parseTermsLines(company?.legal_terms_caption),
    },
    store: quotation.businessUnit
      ? { code: quotation.businessUnit.business_code, address: quotation.businessUnit.address }
      : null,
    paymentAccounts: branding.paymentAccounts.map((account) => ({
      id: Number(account.id),
      type: account.prefix_id ?? "",
      name: account.name ?? "",
      number: account.ref1 ?? null,
      qrUrl: account.ref2 ?? null,
    })),
  };
}
