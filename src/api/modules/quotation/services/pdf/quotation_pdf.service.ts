import path from "path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { DataBase } from "../../../../../database";
import { ASSETS_DIR } from "../../../../../config/paths";
import { loadCompanyAssetDataUri } from "../../../uploads/services/find/company_asset.service";
import {
  formatDateOnlyEsPe,
  formatInstantDateEsPe,
  formatInstantDateTimeEsPe,
} from "../../../../../utils/dateUtils";
import { QUOTATION_STATUS_LABEL, QuotationStatus } from "../../model/quotation.model";
import { getQuotationById } from "../find/quotation.service";
import { CompanyAttributes } from "../../../company/model/company.model";
import { VariableGeneralAttributes } from "../../../variable_general/models/variable_general.model";

// Shape ya "aplanado" (toJSON()) de la cotización + sus asociaciones que
// realmente usa el generador de PDF — evita tipar todo `data` como `any`
// mientras se arma a partir de varios `.toJSON()` de modelos de Sequelize.
interface QuotationPdfItem {
  id: number;
  product?: { name: string } | null;
  technique?: { name: string } | null;
  quantity: number;
  pricing_mode: string;
  unit_price: number;
  subtotal: number;
}

interface QuotationPdfData {
  id: number;
  company_id: number;
  status: string;
  includes_delivery: boolean;
  includes_design: boolean;
  includes_igv: boolean;
  billing_name: string | null;
  billing_document_number: string | null;
  client?: { name: string; document_number: string | null } | null;
  businessUnit?: { address: string | null; business_code: string } | null;
  created_at: Date | string;
  valid_until: Date | string | null;
  production_days: number | null;
  items: QuotationPdfItem[];
  subtotal: number;
  total: number;
  total_paid: number;
  notes: string | null;
  company: Pick<
    CompanyAttributes,
    "logo_url" | "business_name" | "ruc" | "address" | "phone" | "legal_terms_caption"
  > | null;
  // Cada cuenta trae su QR ya resuelto como data URI (ver
  // generateQuotationPdf): las imágenes se leen de la base, que es async, y
  // el documento se arma de forma síncrona.
  paymentAccounts: (Pick<VariableGeneralAttributes, "id" | "prefix_id" | "name" | "ref1" | "ref2"> & {
    qrDataUri: string | null;
  })[];
  logoDataUri: string | null;
  // Color de marca de la empresa (hex, ver themes.primary_color) — antes el
  // PDF siempre salía en violeta fijo sin importar la paleta elegida en
  // "Empresas" (pedido explícito del usuario).
  brandColor: string;
}

// Helvetica (la fuente por defecto de PDF) no trae tildes/ñ — se veían mal
// ("Próceres" salía como "Prýceres"). Roboto sí las tiene; se registra una
// sola vez, con el archivo guardado en <raíz del proyecto>/assets/fonts
// (fuera de src/) para que exista igual en dev (ts-node) y en producción
// (tsc compila a dist/, no copia archivos que no son .ts). Se resuelve desde
// la raíz real del proyecto, no desde process.cwd(): en el hosting el
// proceso puede arrancar en otra carpeta.
const FONTS_DIR = path.join(ASSETS_DIR, "fonts");
Font.register({
  family: "Roboto",
  fonts: [
    { src: path.join(FONTS_DIR, "Roboto-Regular.ttf"), fontWeight: "normal" },
    { src: path.join(FONTS_DIR, "Roboto-Bold.ttf"), fontWeight: "bold" },
  ],
});

// Las imágenes (logo, QR) se embeben como data URI en base64 —
// @react-pdf/renderer intentaba cargar la ruta absoluta de disco directo
// (funciona en teoría, pero en la práctica el logo/QR nunca aparecían en el
// PDF generado, sin error visible: un data URI evita por completo esa carga
// async/por ruta de archivo dentro de la librería). Ahora salen de la base
// (company_asset), ver loadCompanyAssetDataUri.

const money = (value: number) => `S/ ${Number(value).toFixed(2)}`;

// Espejo de QUOTATION_ITEM_PRICING_MODE_LABEL (grulla_fe: quotation.types.ts)
// — sin esto, un item de "medio millar" muestra "Cant. 500" en el PDF sin
// contexto y el cliente puede pensar que compró 500 unidades sueltas al
// precio unitario en vez de un lote cerrado.
const PRICING_MODE_LABEL: Record<string, string> = {
  unit: "Unidad",
  hundred: "Ciento",
  half_thousand: "Medio millar",
  thousand: "Millar",
  custom: "Personalizado",
};

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Roboto", color: "#1F2430" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  logo: { width: 90, height: 90, objectFit: "contain" },
  companyBlock: { alignItems: "flex-end", maxWidth: 260 },
  companyName: { fontSize: 13, fontWeight: 700, marginBottom: 2 },
  small: { fontSize: 8.5, color: "#5B6072" },
  // El color de fondo real se aplica inline con el brandColor de la
  // empresa (ver usos de `styles.titleBar` más abajo) — este solo define la
  // forma/tipografía.
  titleBar: {
    color: "#FFFFFF",
    padding: 10,
    borderRadius: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  titleText: { fontSize: 14, fontWeight: 700 },
  statusBadge: { fontSize: 9, backgroundColor: "rgba(255,255,255,0.2)", paddingVertical: 3, paddingHorizontal: 8, borderRadius: 3 },
  section: { marginBottom: 14 },
  // Color real también inline con brandColor (ver usos de `styles.sectionTitle`).
  sectionTitle: { fontSize: 9.5, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" },
  infoGrid: { flexDirection: "row", justifyContent: "space-between" },
  table: { borderWidth: 1, borderColor: "#E4E4E9", borderRadius: 3 },
  // Gris azulado neutro (el lila anterior venía de la paleta vieja de Grulla).
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#EEF1F6", paddingVertical: 6, paddingHorizontal: 6 },
  tableRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: "#EEEEF2" },
  th: { fontSize: 8.5, fontWeight: 700, color: "#5B6072" },
  td: { fontSize: 9 },
  colProduct: { flex: 2.4 },
  colTechnique: { flex: 1.6 },
  // Cant. es SOLO el número (pedido explícito del usuario) — el modo de
  // precio (unidad/ciento/medio millar/millar/personalizado) tiene su
  // propia columna al lado, igual que en el detalle de cotización en
  // pantalla (QuotationDetailDialog.tsx).
  colQty: { flex: 0.7, textAlign: "right" },
  colMode: { flex: 1.1, textAlign: "right" },
  colPrice: { flex: 1.1, textAlign: "right" },
  colSubtotal: { flex: 1.1, textAlign: "right" },
  colIgv: { flex: 1, textAlign: "right" },
  colTotal: { flex: 1.2, textAlign: "right", fontWeight: 700 },
  totalsBox: { alignSelf: "flex-end", width: 220, marginTop: 10 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalsLabel: { fontSize: 9, color: "#5B6072" },
  totalsValue: { fontSize: 9, fontWeight: 700 },
  balanceRow: { borderTopWidth: 1, borderTopColor: "#E4E4E9", paddingTop: 5, marginTop: 3 },
  paymentCard: {
    borderWidth: 1,
    borderColor: "#E4E4E9",
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qrImage: { width: 64, height: 64 },
  // Cuentas digitales (Yape/Plin): de a dos por fila, pegadas cada una a
  // su lado (izquierda/derecha) — las cuentas bancarias se quedan en
  // paymentCard (una por fila, como antes) porque suelen llevar más texto
  // (pedido explícito del usuario: "yape izquierda, plin derecha, pegado
  // hacia cada lado").
  walletGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 6 },
  walletCard: {
    width: "48.5%",
    borderWidth: 1,
    borderColor: "#E4E4E9",
    borderRadius: 4,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  // Grilla de términos y condiciones, inspirada en el layout numerado del
  // material de marca (tarjetas cortas de 2 columnas, número en círculo).
  termsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  termsCard: {
    width: 245,
    borderWidth: 1,
    borderColor: "#E4E4E9",
    borderRadius: 4,
    padding: 8,
    flexDirection: "row",
    gap: 6,
  },
  // backgroundColor real inline con brandColor (ver uso de `styles.termsBadge`).
  termsBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: 700,
    textAlign: "center",
    paddingTop: 3,
  },
  termsText: { fontSize: 8, color: "#5B6072", lineHeight: 1.4, flex: 1 },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7.5, color: "#8A8F9C", textAlign: "center" },
});

// Cada línea del textarea de "Términos y condiciones" (Documentos de la
// empresa) es una tarjeta — se le quita un posible "1. "/"1) " inicial
// porque el número ya lo pone el círculo de la tarjeta.
const parseTermsLines = (text: string | null | undefined): string[] => {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\d+[.)]\s*/, ""));
};

// yape/plin son cuentas digitales cortas (van en grilla de 2 columnas);
// bank (y cualquier otro tipo futuro) se queda en el layout de una fila
// completa, igual que antes.
const isWalletAccount = (account: QuotationPdfData["paymentAccounts"][number]) =>
  account.prefix_id === "yape" || account.prefix_id === "plin";

const QuotationDocument = (props: { data: QuotationPdfData }) => {
  const { data } = props;
  const logoDataUri = data.logoDataUri;
  // Si ningún item lleva técnica (productos sin personalización), la columna
  // "Técnica" se omite entera; si se mezclan, los que no llevan muestran "—".
  const showTechnique = data.items.some((item) => Boolean(item.technique));
  // Helper para no repetir `[styles.sectionTitle, { color: data.brandColor }]`
  // en cada uno de los ~8 títulos de sección del documento.
  const sectionTitle = (label: string) =>
    createElement(Text, { style: [styles.sectionTitle, { color: data.brandColor }] }, label);

  return createElement(
    Document,
    {},
    createElement(
      Page,
      { size: "A4", style: styles.page },
      // Encabezado: logo + datos de la empresa
      createElement(
        View,
        { style: styles.headerRow },
        logoDataUri ? createElement(Image, { src: logoDataUri, style: styles.logo }) : createElement(View, {}),
        createElement(
          View,
          { style: styles.companyBlock },
          // La dirección de la TIENDA tiene prioridad (se configura en
          // Tiendas, sección "Dirección"); si esa tienda no tiene
          // dirección cargada, se cae a la dirección de la empresa
          // (pedido explícito del usuario). Nunca se muestran las dos —
          // una sola línea de dirección, sin ambigüedad.
          createElement(Text, { style: styles.companyName }, data.company?.business_name ?? ""),
          data.company?.ruc && createElement(Text, { style: styles.small }, `RUC: ${data.company.ruc}`),
          (() => {
            const resolvedAddress = data.businessUnit?.address || data.company?.address;
            return resolvedAddress && createElement(Text, { style: styles.small }, resolvedAddress);
          })(),
          data.company?.phone && createElement(Text, { style: styles.small }, `Tel: ${data.company.phone}`),
          data.businessUnit &&
            createElement(
              Text,
              { style: [styles.small, { marginTop: 3 }] },
              `Tienda: ${data.businessUnit.business_code}`,
            ),
        ),
      ),
      // Barra de título
      createElement(
        View,
        { style: [styles.titleBar, { backgroundColor: data.brandColor }] },
        createElement(Text, { style: styles.titleText }, `Cotización COT-${String(data.id).padStart(4, "0")}`),
        createElement(Text, { style: styles.statusBadge }, QUOTATION_STATUS_LABEL[data.status as QuotationStatus]),
      ),
      // Etiquetas "incluye" (delivery/diseño) — solo informativas, no
      // afectan el cálculo (a diferencia de IGV, que sí lo hace).
      (data.includes_delivery || data.includes_design) &&
        createElement(
          View,
          { style: { flexDirection: "row", gap: 6, marginBottom: 10 } },
          // Mismo estilo para las dos etiquetas (la de diseño era lila, de la
          // paleta vieja de Grulla).
          data.includes_delivery &&
            createElement(
              Text,
              { style: { fontSize: 8, backgroundColor: "#E6ECF7", color: "#002E77", padding: 4, borderRadius: 3 } },
              "Incluye delivery",
            ),
          data.includes_design &&
            createElement(
              Text,
              { style: { fontSize: 8, backgroundColor: "#E6ECF7", color: "#002E77", padding: 4, borderRadius: 3 } },
              "Incluye diseño",
            ),
        ),
      // Cliente + fechas
      createElement(
        View,
        { style: styles.section },
        createElement(
          View,
          { style: styles.infoGrid },
          // Si la cotización pide salir "a nombre de" otra persona/
          // empresa (billing_name), eso es lo que se imprime acá — el
          // cliente vinculado (data.client) sigue siendo el mismo en el
          // sistema, esto solo cambia qué nombre/documento ve el cliente
          // final en el PDF (pedido explícito del usuario).
          createElement(
            View,
            {},
            sectionTitle("Cliente"),
            createElement(Text, { style: styles.td }, data.billing_name || data.client?.name || "—"),
            (data.billing_document_number || data.client?.document_number) &&
              createElement(
                Text,
                { style: styles.small },
                `Doc: ${data.billing_document_number || data.client?.document_number}`,
              ),
          ),
          createElement(
            View,
            {},
            sectionTitle("Fecha de emisión"),
            createElement(Text, { style: styles.td }, formatInstantDateEsPe(data.created_at)),
          ),
          data.valid_until &&
            createElement(
              View,
              {},
              sectionTitle("Válida hasta"),
              createElement(Text, { style: styles.td }, formatDateOnlyEsPe(data.valid_until)),
            ),
          data.production_days &&
            createElement(
              View,
              {},
              sectionTitle("Producción"),
              createElement(
                Text,
                { style: styles.td },
                `${data.production_days} día${data.production_days === 1 ? "" : "s"} hábil${data.production_days === 1 ? "" : "es"}`,
              ),
            ),
        ),
      ),
      // Tabla de productos
      createElement(
        View,
        { style: styles.section },
        createElement(
          View,
          { style: styles.table },
          createElement(
            View,
            { style: styles.tableHeaderRow },
            createElement(Text, { style: [styles.th, styles.colProduct] }, "Producto"),
            // Sin ningún producto personalizado, la columna "Técnica" no aparece
            // (pedido explícito del usuario: "no va a salir ni en los pdf").
            showTechnique ? createElement(Text, { style: [styles.th, styles.colTechnique] }, "Técnica") : null,
            createElement(Text, { style: [styles.th, styles.colQty] }, "Cant."),
            createElement(Text, { style: [styles.th, styles.colMode] }, "Modo"),
            createElement(Text, { style: [styles.th, styles.colPrice] }, "P. unit."),
            // Mismas columnas que el detalle en pantalla (pedido explícito
            // del usuario: que se vea claro cuánto se paga por cada producto
            // y su IGV). Antes salía "IGV" antes de un "Subtotal" sin IGV y
            // no había total por producto.
            ...(data.includes_igv
              ? [
                  createElement(Text, { style: [styles.th, styles.colSubtotal], key: "h-subtotal" }, "Subtotal"),
                  createElement(Text, { style: [styles.th, styles.colIgv], key: "h-igv" }, "IGV"),
                  createElement(Text, { style: [styles.th, styles.colTotal], key: "h-total" }, "Total"),
                ]
              : [createElement(Text, { style: [styles.th, styles.colTotal], key: "h-total" }, "Total (sin IGV)")]),
          ),
          ...data.items.map((item: QuotationPdfItem) => {
            // IGV por línea, derivado del real cobrado (total-subtotal),
            // repartido proporcional al peso de esta línea en el subtotal
            // total — igual criterio que el desglose en pantalla
            // (QuotationDetailDialog.tsx: nunca recalcula con el % actual
            // configurado, se basa en lo que de verdad se cobró).
            const lineIgv = data.includes_igv && data.subtotal > 0 ? (item.subtotal / data.subtotal) * (data.total - data.subtotal) : 0;
            const lineTotal = Number(item.subtotal) + lineIgv;

            return createElement(
              View,
              { style: styles.tableRow, key: item.id },
              createElement(Text, { style: [styles.td, styles.colProduct] }, item.product?.name ?? "—"),
              showTechnique
                ? createElement(Text, { style: [styles.td, styles.colTechnique] }, item.technique?.name ?? "—")
                : null,
              createElement(Text, { style: [styles.td, styles.colQty] }, String(item.quantity)),
              createElement(
                Text,
                { style: [styles.td, styles.colMode] },
                PRICING_MODE_LABEL[item.pricing_mode] ?? item.pricing_mode,
              ),
              createElement(Text, { style: [styles.td, styles.colPrice] }, money(item.unit_price)),
              ...(data.includes_igv
                ? [
                    createElement(Text, { style: [styles.td, styles.colSubtotal], key: "subtotal" }, money(item.subtotal)),
                    createElement(Text, { style: [styles.td, styles.colIgv], key: "igv" }, money(lineIgv)),
                  ]
                : []),
              createElement(Text, { style: [styles.td, styles.colTotal], key: "total" }, money(lineTotal)),
            );
          }),
        ),
        createElement(
          View,
          { style: styles.totalsBox },
          data.includes_igv &&
            createElement(
              View,
              { style: styles.totalsRow },
              createElement(Text, { style: styles.totalsLabel }, "Subtotal"),
              createElement(Text, { style: styles.totalsValue }, money(data.subtotal)),
            ),
          // El IGV se muestra siempre (como en pantalla), con su % real o
          // "No incluido", para que el cliente sepa si el total lo incluye.
          createElement(
            View,
            { style: styles.totalsRow },
            createElement(
              Text,
              { style: styles.totalsLabel },
              data.includes_igv && data.subtotal > 0
                ? `IGV (${Math.round(((data.total - data.subtotal) / data.subtotal) * 100)}%)`
                : "IGV",
            ),
            createElement(
              Text,
              { style: styles.totalsValue },
              data.includes_igv ? money(data.total - data.subtotal) : "No incluido",
            ),
          ),
          // "Pagado"/"Saldo" ya NO se muestran acá (pedido explícito del
          // usuario: "en el pdf de la cotización no debe salir cuánto el
          // cliente ha pagado") — el PDF es un documento externo para el
          // cliente, ese detalle de cobranza queda solo en el panel interno
          // (QuotationDetailDialog.tsx). Se quita también "Saldo" porque
          // Total-Saldo revelaría lo pagado igual.
          createElement(
            View,
            { style: [styles.totalsRow, styles.balanceRow] },
            createElement(Text, { style: [styles.totalsLabel, { fontWeight: 700, color: "#1F2430" }] }, "Total a pagar"),
            createElement(Text, { style: [styles.totalsValue, { fontSize: 11, color: data.brandColor }] }, money(data.total)),
          ),
        ),
      ),
      // Notas
      data.notes &&
        createElement(
          View,
          { style: styles.section },
          sectionTitle("Notas"),
          createElement(Text, { style: styles.td }, data.notes),
        ),
      // Cuentas de pago: bancarias primero (una fila completa cada una,
      // suelen llevar más texto), cuentas digitales (Yape/Plin) después en
      // una grilla de 2 columnas porque son cortas (pedido explícito del
      // usuario).
      (() => {
        const bankAccounts = data.paymentAccounts.filter((account) => !isWalletAccount(account));
        // Yape siempre a la izquierda, Plin a la derecha (pedido explícito
        // del usuario) — se ordena por prefix_id antes de emparejar de a
        // dos en la grilla.
        const WALLET_ORDER: Record<string, number> = { yape: 0, plin: 1 };
        const walletAccounts = data.paymentAccounts
          .filter((account) => isWalletAccount(account))
          .sort((a, b) => (WALLET_ORDER[a.prefix_id] ?? 99) - (WALLET_ORDER[b.prefix_id] ?? 99));
        if (bankAccounts.length === 0 && walletAccounts.length === 0) return null;

        const renderAccount = (
          account: QuotationPdfData["paymentAccounts"][number],
          cardStyle: ReturnType<typeof StyleSheet.create>[string]
        ) => {
          const qrDataUri = account.qrDataUri;
          return createElement(
            View,
            { style: cardStyle, key: account.id },
            qrDataUri ? createElement(Image, { src: qrDataUri, style: styles.qrImage }) : null,
            createElement(
              View,
              { style: { flexShrink: 1 } },
              createElement(Text, { style: { fontSize: 9.5, fontWeight: 700 } }, account.name),
              account.ref1 && createElement(Text, { style: styles.small }, account.ref1),
            ),
          );
        };

        return createElement(
          View,
          { style: styles.section },
          sectionTitle("Métodos de pago"),
          ...bankAccounts.map((account) => renderAccount(account, styles.paymentCard)),
          walletAccounts.length > 0 &&
            createElement(
              View,
              { style: styles.walletGrid },
              ...walletAccounts.map((account) => renderAccount(account, styles.walletCard)),
            ),
        );
      })(),
      // Términos y condiciones: texto único configurado en "Documentos de
      // la empresa" (company.legal_terms_caption), se aplica igual a TODAS
      // las cotizaciones — tanto en la previsualización como en la
      // descarga, porque ambas usan este mismo generador de PDF. Se
      // muestra como grilla de tarjetas numeradas (una línea del textarea
      // = una tarjeta), inspirado en el material de marca de la empresa.
      // "break: true" fuerza que arranque SIEMPRE en una hoja nueva — el
      // texto puede ser largo, y así la cotización en sí (productos/
      // totales/pagos) se queda en una sola hoja aunque los términos
      // ocupen varias (pedido explícito del usuario).
      (() => {
        const terms = parseTermsLines(data.company?.legal_terms_caption);
        if (terms.length === 0) return null;

        return createElement(
          View,
          { style: styles.section, break: true },
          sectionTitle("Términos y condiciones"),
          createElement(
            View,
            { style: styles.termsGrid },
            ...terms.map((line, index) =>
              createElement(
                View,
                { style: styles.termsCard, key: index },
                createElement(
                  Text,
                  { style: [styles.termsBadge, { backgroundColor: data.brandColor }] },
                  String(index + 1),
                ),
                createElement(Text, { style: styles.termsText }, line),
              ),
            ),
          ),
        );
      })(),
      createElement(Text, { style: styles.footer, fixed: true }, `Generado el ${formatInstantDateTimeEsPe(new Date())}`),
    ),
  );
};

export const generateQuotationPdf = async (quotationId: number): Promise<Buffer> => {
  const quotation = await getQuotationById(quotationId);
  if (!quotation) throw new Error("La cotización no existe");

  // `getQuotationById` trae `include` (client, businessUnit, items...) que
  // `QuotationAttributes`/`toJSON()` no reflejan en su tipo estático (misma
  // limitación de Sequelize con asociaciones ya comentada en otros services
  // de este módulo) — por eso el paso intermedio por `unknown`, nunca `any`.
  const plain = quotation.toJSON() as unknown as Omit<QuotationPdfData, "company" | "paymentAccounts">;

  const company = await DataBase.instance.company.findOne({ where: { id: plain.company_id ?? undefined } });
  const paymentAccounts = await DataBase.instance.variable_general.findAll({
    // Solo cuentas activas: una cuenta deshabilitada ya no debe ofrecérsele
    // al cliente para pagar (antes salían todas, incluidas las dadas de baja).
    where: { category: "payment_account", company_id: plain.company_id, is_deleted: false },
    order: [["id", "ASC"]],
  });

  // Mismo criterio que el frontend (useBrandTheme.ts): "blue" es la paleta
  // por defecto, si la empresa no tiene ninguna elegida o el código no
  // coincide con ningún tema activo, se cae al azul de siempre.
  // Azul de Vanys (seeder 20261021140000-vanys-default-theme.js).
  const DEFAULT_BRAND_COLOR = "#002E77";
  const theme = await DataBase.instance.theme.findOne({ where: { code: company?.theme_color || "blue" } });
  const brandColor = theme?.primary_color || DEFAULT_BRAND_COLOR;

  // Logo y QRs se cargan en paralelo desde la base antes de armar el
  // documento (que es síncrono).
  const [logoDataUri, accountsWithQr] = await Promise.all([
    loadCompanyAssetDataUri(company?.logo_url),
    Promise.all(
      paymentAccounts.map(async (row) => {
        const account = row.toJSON();
        return { ...account, qrDataUri: await loadCompanyAssetDataUri(account.ref2) };
      })
    ),
  ]);

  const data: QuotationPdfData = {
    ...plain,
    company: company ? company.toJSON() : null,
    paymentAccounts: accountsWithQr,
    logoDataUri,
    brandColor,
  };

  // `QuotationDocument` es una función común (no un componente que React
  // reconcilie) — llamarla directo devuelve el mismo `React.ReactElement`
  // que arma con `createElement(Document, ...)`, ya con el tipo exacto que
  // pide `renderToBuffer` (evita el cast que había antes).
  return renderToBuffer(QuotationDocument({ data }));
};
