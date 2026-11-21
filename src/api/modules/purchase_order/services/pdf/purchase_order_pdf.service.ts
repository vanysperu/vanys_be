import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { createElement, ReactElement } from "react";
import { IToken } from "../../../../interfaces/IToken.interface";
import { AppError } from "../../../../../core/errors/AppError";
import { pdfCompanyHeader, PDF_BASE_STYLES, registerPdfFonts } from "../../../../../core/pdf/pdf_shared";
import { DataBase } from "../../../../../database";
import { formatInstantDateEsPe, formatInstantDateTimeEsPe } from "../../../../../utils/dateUtils";
import { companiesWithProductImages } from "../../../product/services/shared/images";
import { isOutOfReadScope } from "../../../quotation/services/shared/quotation_scope";
import { loadQuotationBranding } from "../../../quotation/services/shared/quotation_branding";
import { loadCompanyAssetDataUri } from "../../../uploads/services/find/company_asset.service";
import { loadPurchasesByItemIds } from "../find/purchase_order_item_purchase.service";
import { productPhotoForPdf } from "./product_photos";

registerPdfFonts();

const ORDER_STATUS_LABEL: Record<string, string> = { pending: "Pendiente", purchased: "Comprada" };
const ITEM_STATUS_LABEL: Record<string, string> = { pending: "Por comprar", purchased: "Comprado", not_needed: "No hace falta" };

const styles = StyleSheet.create({
  ...PDF_BASE_STYLES,
  infoRow: { flexDirection: "row", gap: 16, marginBottom: 14 },
  infoCell: { flex: 1 },
  infoLabel: { fontSize: 8, color: "#5B6072", marginBottom: 2 },
  infoValue: { fontSize: 10, fontWeight: 700 },
  colPhoto: { width: 58 },
  photo: { width: 52, height: 52, objectFit: "contain", borderRadius: 3 },
  photoEmpty: { width: 52, height: 52, borderRadius: 3, backgroundColor: "#F3F4F7" },
  colProduct: { flex: 2.6 },
  productName: { fontSize: 9.5, fontWeight: 700 },
  productDetail: { fontSize: 8, color: "#5B6072", marginTop: 2 },
  colCode: { flex: 1.1 },
  colColor: { flex: 1 },
  colQty: { flex: 0.8, textAlign: "right" },
  colStatus: { flex: 1.1, textAlign: "right" },
  notes: { fontSize: 9, color: "#1F2430", lineHeight: 1.4 },
});

interface PdfItem {
  id: number;
  photo: string | null;
  name: string;
  sku: string | null;
  description: string | null;
  code: string | null;
  color: string | null;
  quantity: number;
  bought: number;
  status: string;
}

interface PdfData {
  orderCode: string;
  status: string;
  quotationCode: string;
  clientName: string;
  assigneeName: string;
  createdAt: Date;
  notes: string | null;
  brandColor: string;
  logoDataUri: string | null;
  company: { business_name?: string | null; ruc?: string | null; address?: string | null; phone?: string | null } | null;
  store: { address: string | null; business_code: string } | null;
  items: PdfItem[];
}

// Fila de un producto: foto, nombre con SKU y descripción, código, color, cantidades y estado.
const itemRow = (item: PdfItem): ReactElement =>
  createElement(
    View,
    { style: [styles.tableRow, { alignItems: "center" }], key: item.id, wrap: false },
    createElement(
      View,
      { style: styles.colPhoto },
      item.photo ? createElement(Image, { src: item.photo, style: styles.photo }) : createElement(View, { style: styles.photoEmpty })
    ),
    createElement(
      View,
      { style: styles.colProduct },
      createElement(Text, { style: styles.productName }, item.name),
      item.sku ? createElement(Text, { style: styles.productDetail }, `SKU: ${item.sku}`) : null,
      item.description ? createElement(Text, { style: styles.productDetail }, item.description.slice(0, 220)) : null
    ),
    createElement(Text, { style: [styles.td, styles.colCode] }, item.code || "—"),
    createElement(Text, { style: [styles.td, styles.colColor] }, item.color || "—"),
    createElement(Text, { style: [styles.td, styles.colQty, { fontWeight: 700 }] }, String(item.quantity)),
    createElement(Text, { style: [styles.td, styles.colQty] }, String(item.bought)),
    createElement(Text, { style: [styles.td, styles.colStatus] }, ITEM_STATUS_LABEL[item.status] ?? item.status)
  );

const infoCell = (label: string, value: string): ReactElement =>
  createElement(
    View,
    { style: styles.infoCell },
    createElement(Text, { style: styles.infoLabel }, label),
    createElement(Text, { style: styles.infoValue }, value || "—")
  );

// Sin anotar el retorno: renderToBuffer necesita el tipo exacto de <Document>.
const PurchaseOrderDocument = (data: PdfData) =>
  createElement(
    Document,
    {},
    createElement(
      Page,
      { size: "A4", style: styles.page },
      pdfCompanyHeader({
        logoDataUri: data.logoDataUri,
        company: data.company,
        storeAddress: data.store?.address,
        storeCode: data.store?.business_code,
      }),
      createElement(
        View,
        { style: [styles.titleBar, { backgroundColor: data.brandColor }] },
        createElement(Text, { style: styles.titleText }, `Orden de compra ${data.orderCode}`),
        createElement(Text, { style: styles.statusBadge }, ORDER_STATUS_LABEL[data.status] ?? data.status)
      ),
      createElement(
        View,
        { style: styles.infoRow },
        infoCell("Cotización", data.quotationCode),
        infoCell("Cliente", data.clientName),
        infoCell("Encargado de comprar", data.assigneeName),
        infoCell("Fecha", formatInstantDateEsPe(data.createdAt))
      ),
      createElement(
        View,
        { style: styles.section },
        createElement(Text, { style: [styles.sectionTitle, { color: data.brandColor }] }, "Qué comprar"),
        createElement(
          View,
          { style: styles.table },
          createElement(
            View,
            { style: styles.tableHeaderRow, fixed: true },
            createElement(Text, { style: [styles.th, styles.colPhoto] }, "Foto"),
            createElement(Text, { style: [styles.th, styles.colProduct] }, "Producto"),
            createElement(Text, { style: [styles.th, styles.colCode] }, "Código"),
            createElement(Text, { style: [styles.th, styles.colColor] }, "Color"),
            createElement(Text, { style: [styles.th, styles.colQty] }, "Cant."),
            createElement(Text, { style: [styles.th, styles.colQty] }, "Comprado"),
            createElement(Text, { style: [styles.th, styles.colStatus] }, "Estado")
          ),
          ...data.items.map(itemRow)
        )
      ),
      data.notes
        ? createElement(
            View,
            { style: styles.section },
            createElement(Text, { style: [styles.sectionTitle, { color: data.brandColor }] }, "Notas"),
            createElement(Text, { style: styles.notes }, data.notes)
          )
        : null,
      createElement(Text, { style: styles.footer, fixed: true }, `Generado el ${formatInstantDateTimeEsPe(new Date())}`)
    )
  );

interface OrderRow {
  id: number;
  company_id: number;
  status: string;
  notes: string | null;
  created_at: Date;
  quotation_id: number;
  quotation?: { business_unit_id: number | null; client?: { name: string } | null } | null;
  assignee?: { name: string | null; paternal_lastname: string | null } | null;
  items?: {
    id: number;
    quantity: number;
    status: string;
    quotationItem?: {
      product_code: string | null;
      color: string | null;
      product?: { id: number; name: string; sku: string | null; description: string | null; image_path: string | null } | null;
    } | null;
  }[];
}

/**
 * PDF de una orden de compra (pedido del usuario, 21-nov): qué hay que
 * comprar, con la foto y los datos de cada producto. Mismo alcance de
 * lectura que el detalle de la orden (empresa y tienda de su cotización).
 */
export async function generatePurchaseOrderPdf(purchaseOrderId: number, user: IToken): Promise<{ fileName: string; pdf: Buffer }> {
  const order = (await DataBase.instance.purchase_order.findOne({
    where: { id: purchaseOrderId },
    include: [
      {
        association: "quotation",
        attributes: ["id", "business_unit_id", "client_id"],
        include: [{ association: "client", attributes: ["name"] }],
      },
      { association: "assignee", attributes: ["name", "paternal_lastname"] },
      {
        association: "items",
        separate: true,
        order: [["id", "ASC"]],
        include: [
          {
            association: "quotationItem",
            attributes: ["id", "product_code", "color"],
            include: [{ association: "product", attributes: ["id", "name", "sku", "description", "image_path"] }],
          },
        ],
      },
    ],
  })) as unknown as OrderRow | null;
  if (!order) throw new AppError(404, "La orden de compra no existe", undefined, "NOT_FOUND");
  const ownership = { company_id: Number(order.company_id), business_unit_id: order.quotation?.business_unit_id ?? null };
  if (isOutOfReadScope(ownership, user)) throw new AppError(403, "No tienes acceso a esta orden de compra");

  const items = order.items ?? [];
  const companyId = Number(order.company_id);
  const [branding, imagesEnabled, purchasesByItem, store] = await Promise.all([
    loadQuotationBranding(companyId),
    companiesWithProductImages([companyId]),
    loadPurchasesByItemIds(items.map((item) => Number(item.id))),
    order.quotation?.business_unit_id
      ? DataBase.instance.business_unit.findByPk(order.quotation.business_unit_id, { attributes: ["address", "business_code"] })
      : Promise.resolve(null),
  ]);
  const showPhotos = imagesEnabled.has(companyId);

  // Una conversión por producto (dos ítems del mismo producto comparten foto).
  const photoByProduct = new Map<number, Promise<string | null>>();
  const photoOf = (product: { id: number; image_path: string | null } | null | undefined): Promise<string | null> => {
    if (!showPhotos || !product?.image_path) return Promise.resolve(null);
    const cached = photoByProduct.get(Number(product.id));
    if (cached) return cached;
    const pending = productPhotoForPdf(product.image_path);
    photoByProduct.set(Number(product.id), pending);
    return pending;
  };

  const [logoDataUri, pdfItems] = await Promise.all([
    loadCompanyAssetDataUri(branding.company?.logo_url),
    Promise.all(
      items.map(async (item): Promise<PdfItem> => {
        const product = item.quotationItem?.product;
        const bought = (purchasesByItem.get(Number(item.id)) ?? [])
          .filter((purchase) => !purchase.is_deleted)
          .reduce((sum, purchase) => sum + Number(purchase.quantity), 0);
        return {
          id: Number(item.id),
          photo: await photoOf(product),
          name: product?.name ?? "Producto",
          sku: product?.sku ?? null,
          description: product?.description ?? null,
          code: item.quotationItem?.product_code ?? null,
          color: item.quotationItem?.color ?? null,
          quantity: Number(item.quantity),
          bought,
          status: item.status,
        };
      })
    ),
  ]);

  const assignee = order.assignee ? [order.assignee.name, order.assignee.paternal_lastname].filter(Boolean).join(" ") : "";
  const orderCode = `OC-${String(order.id).padStart(4, "0")}`;
  const pdf = await renderToBuffer(
    PurchaseOrderDocument({
      orderCode,
      status: order.status,
      quotationCode: `COT-${String(order.quotation_id).padStart(4, "0")}`,
      clientName: order.quotation?.client?.name ?? "",
      assigneeName: assignee,
      createdAt: order.created_at,
      notes: order.notes,
      brandColor: branding.brandColor,
      logoDataUri,
      company: branding.company ? branding.company.toJSON() : null,
      store: store ? { address: store.address ?? null, business_code: store.business_code } : null,
      items: pdfItems,
    })
  );
  return { fileName: `orden-de-compra-${String(order.id).padStart(4, "0")}.pdf`, pdf };
}
