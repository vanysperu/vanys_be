import { IToken } from "../../../../interfaces/IToken.interface";
import { AppError } from "../../../../../core/errors/AppError";
import { DataBase } from "../../../../../database";
import { QuotationMockupModel } from "../../model/quotation_mockup.model";
import { isOutOfReadScope } from "../shared/quotation_scope";

// Lo que se devuelve de un mockup (sin los bytes del archivo).
export interface QuotationMockupDto {
  id: number;
  quotation_id: number;
  quotation_item_id: number | null;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  caption: string | null;
  created_at: Date;
  uploaded_by: string | null;
}

interface MockupWithActor extends QuotationMockupModel {
  actor?: { name: string | null; paternal_lastname: string | null } | null;
}

export const toMockupDto = (row: MockupWithActor): QuotationMockupDto => ({
  id: Number(row.id),
  quotation_id: Number(row.quotation_id),
  quotation_item_id: row.quotation_item_id === null ? null : Number(row.quotation_item_id),
  file_name: row.file_name,
  mime_type: row.mime_type,
  size_bytes: Number(row.size_bytes),
  caption: row.caption,
  created_at: row.created_at,
  uploaded_by: row.actor ? [row.actor.name, row.actor.paternal_lastname].filter(Boolean).join(" ") || null : null,
});

/**
 * La cotización existe, no está borrada y el usuario la puede VER (mismo
 * alcance que el detalle). Los mockups son del equipo: quien ve la cotización
 * ve sus diseños.
 */
export async function assertQuotationReadable(quotationId: number, user: IToken): Promise<void> {
  const quotation = await DataBase.instance.quotation.findOne({
    where: { id: quotationId, is_deleted: false },
    attributes: ["id", "company_id", "business_unit_id"],
  });
  if (!quotation) throw new AppError(404, "La cotización no existe", undefined, "NOT_FOUND");
  if (isOutOfReadScope(quotation, user)) throw new AppError(403, "No tienes acceso a esta cotización");
}

// Un mockup activo y su cotización legible por el usuario (404 si no existe o
// está quitado; nunca se dice si es de otra empresa).
export async function loadReadableMockup(mockupId: number, user: IToken, withData = false): Promise<QuotationMockupModel> {
  const mockup = await DataBase.instance.quotation_mockup.findOne({
    where: { id: mockupId, active: true },
    ...(withData ? {} : { attributes: { exclude: ["data"] } }),
  });
  if (!mockup) throw new AppError(404, "El diseño no existe", undefined, "NOT_FOUND");
  await assertQuotationReadable(Number(mockup.quotation_id), user);
  return mockup;
}
