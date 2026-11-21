import path from "path";
import { Font, Image, Text, View } from "@react-pdf/renderer";
import { createElement, ReactElement } from "react";
import { ASSETS_DIR } from "../../config/paths";

// Piezas comunes de los PDF del sistema (cotización y orden de compra,
// 21-nov): fuentes, formato de dinero, estilos base y el encabezado con el
// logo y los datos de la empresa. Antes vivían solo en el PDF de la
// cotización; se extrajeron sin cambiar cómo se ve.

// Helvetica (la fuente por defecto de PDF) no trae tildes/ñ — se veían mal
// ("Próceres" salía como "Prýceres"). Roboto sí las tiene; se registra una
// sola vez, con el archivo guardado en <raíz del proyecto>/assets/fonts
// (fuera de src/) para que exista igual en dev (ts-node) y en producción
// (tsc compila a dist/, no copia archivos que no son .ts). Se resuelve desde
// la raíz real del proyecto, no desde process.cwd(): en el hosting el
// proceso puede arrancar en otra carpeta.
const FONTS_DIR = path.join(ASSETS_DIR, "fonts");
let fontsRegistered = false;

export const registerPdfFonts = (): void => {
  if (fontsRegistered) return;
  Font.register({
    family: "Roboto",
    fonts: [
      { src: path.join(FONTS_DIR, "Roboto-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(FONTS_DIR, "Roboto-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  fontsRegistered = true;
};

export const pdfMoney = (value: number): string => `S/ ${Number(value).toFixed(2)}`;

// Estilos base (valores planos: cada PDF los mezcla con los suyos en su
// propio StyleSheet.create).
export const PDF_BASE_STYLES = {
  page: { padding: 32, fontSize: 9, fontFamily: "Roboto", color: "#1F2430" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  logo: { width: 90, height: 90, objectFit: "contain" },
  companyBlock: { alignItems: "flex-end", maxWidth: 260 },
  companyName: { fontSize: 13, fontWeight: 700, marginBottom: 2 },
  small: { fontSize: 8.5, color: "#5B6072" },
  // El color de fondo real se aplica inline con el brandColor de la empresa.
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
  // Color real también inline con brandColor.
  sectionTitle: { fontSize: 9.5, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" },
  table: { borderWidth: 1, borderColor: "#E4E4E9", borderRadius: 3 },
  // gap: sin espacio entre columnas, un texto largo se pegaba con el de al lado.
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#EEF1F6", paddingVertical: 6, paddingHorizontal: 6, gap: 6 },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: "#EEEEF2",
    gap: 6,
  },
  th: { fontSize: 8.5, fontWeight: 700, color: "#5B6072" },
  td: { fontSize: 9 },
  footer: { position: "absolute", bottom: 24, left: 32, right: 32, fontSize: 7.5, color: "#8A8F9C", textAlign: "center" },
} as const;

export interface PdfCompanyInfo {
  business_name?: string | null;
  ruc?: string | null;
  address?: string | null;
  phone?: string | null;
}

/**
 * Encabezado: logo a la izquierda y datos de la empresa a la derecha. La
 * dirección de la TIENDA tiene prioridad (se configura en Tiendas); si no
 * tiene, la de la empresa — nunca las dos (pedido explícito del usuario).
 */
export const pdfCompanyHeader = ({
  logoDataUri,
  company,
  storeAddress,
  storeCode,
}: {
  logoDataUri: string | null;
  company: PdfCompanyInfo | null;
  storeAddress?: string | null;
  storeCode?: string | null;
}): ReactElement => {
  const resolvedAddress = storeAddress || company?.address;
  return createElement(
    View,
    { style: PDF_BASE_STYLES.headerRow },
    logoDataUri ? createElement(Image, { src: logoDataUri, style: PDF_BASE_STYLES.logo }) : createElement(View, {}),
    createElement(
      View,
      { style: PDF_BASE_STYLES.companyBlock },
      createElement(Text, { style: PDF_BASE_STYLES.companyName }, company?.business_name ?? ""),
      company?.ruc && createElement(Text, { style: PDF_BASE_STYLES.small }, `RUC: ${company.ruc}`),
      resolvedAddress && createElement(Text, { style: PDF_BASE_STYLES.small }, resolvedAddress),
      company?.phone && createElement(Text, { style: PDF_BASE_STYLES.small }, `Tel: ${company.phone}`),
      storeCode && createElement(Text, { style: [PDF_BASE_STYLES.small, { marginTop: 3 }] }, `Tienda: ${storeCode}`)
    )
  );
};
