import { generateQuotationPdf } from "../../../quotation/services/pdf/quotation_pdf.service";
import { QuotationEmailPayload, RenderedEmail } from "../../types/email.types";
import { escapeHtml, renderLayout, renderPlainText } from "./layout";

// Correo de la cotización (Sprint 2, ítem 7; el usuario pidió "por link o PDF,
// como salga mejor"): lleva los dos. El enlace muestra siempre la versión
// vigente y avisa cuándo la abrió el cliente; el PDF adjunto le sirve para
// reenviarlo dentro de su empresa. El PDF se genera al enviar, no al encolar.
export async function renderQuotationEmail(payload: QuotationEmailPayload): Promise<RenderedEmail> {
  const title = `Cotización ${payload.quotationCode}`;
  const messageParagraphs = payload.message
    .split(/\n{2,}/)
    .map((block) => escapeHtml(block.trim()).replace(/\n/g, "<br>"))
    .filter(Boolean);
  const summary = [
    `<strong>Total:</strong> ${escapeHtml(payload.total)}`,
    ...(payload.validUntil ? [`<strong>Válida hasta:</strong> ${escapeHtml(payload.validUntil)}`] : []),
  ].join("<br>");
  const paragraphs = [...messageParagraphs, summary];

  const attachments = payload.attachPdf
    ? [{ name: `${payload.quotationCode}.pdf`, contentBase64: (await generateQuotationPdf(payload.quotationId)).toString("base64") }]
    : [];

  const footnote = payload.attachPdf
    ? "La cotización también va adjunta en PDF. Para cualquier consulta, responde este correo."
    : "Para cualquier consulta, responde este correo.";

  return {
    html: renderLayout({
      title,
      paragraphs,
      button: payload.link ? { label: "Ver cotización", url: payload.link } : undefined,
      footnote: escapeHtml(footnote),
      brandName: payload.companyName,
    }),
    text: renderPlainText(title, paragraphs, payload.link ?? undefined),
    attachments,
    fromName: `${payload.companyName} vía Vanys`.slice(0, 70),
  };
}
