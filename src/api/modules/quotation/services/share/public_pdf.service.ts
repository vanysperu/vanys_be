import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { generateQuotationPdf } from "../pdf/quotation_pdf.service";
import { findEnabledPublicLink } from "./public_view.service";

/**
 * PDF de la vista pública: el mismo del sistema (botón "Ver PDF"), solo con el
 * enlace encendido. Desde el 21-nov el enlace `/c/<código>` abre directamente
 * este PDF (pedido del usuario), así que aplica las mismas reglas que la vista
 * JSON: una cotización borrada o incompleta (pedido de la web) no se entrega.
 */
export async function getPublicQuotationPdf(code: string): Promise<{ fileName: string; pdf: Buffer }> {
  const link = await findEnabledPublicLink(code);
  const quotationId = Number(link.quotation_id);
  const quotation = await DataBase.instance.quotation.findOne({
    where: { id: quotationId, is_deleted: false },
    attributes: ["id", "status"],
  });
  if (!quotation || quotation.status === "quote_requested") {
    throw new AppError(404, "Esta cotización ya no está disponible", undefined, "PUBLIC_QUOTATION_UNAVAILABLE");
  }
  // Mismo nombre que el PDF que se descarga desde el sistema.
  return { fileName: `cotizacion-${String(quotationId).padStart(4, "0")}.pdf`, pdf: await generateQuotationPdf(quotationId) };
}
