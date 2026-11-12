import { generateQuotationPdf } from "../pdf/quotation_pdf.service";
import { quotationCode } from "../../../invoice/services/shared/drive_copy";
import { findEnabledPublicLink } from "./public_view.service";

/** PDF de la vista pública: el mismo del sistema, solo con el enlace encendido. */
export async function getPublicQuotationPdf(code: string): Promise<{ fileName: string; pdf: Buffer }> {
  const link = await findEnabledPublicLink(code);
  const quotationId = Number(link.quotation_id);
  return { fileName: `${quotationCode(quotationId)}.pdf`, pdf: await generateQuotationPdf(quotationId) };
}
