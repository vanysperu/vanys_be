import { randomBytes } from "crypto";
import { Transaction, UniqueConstraintError } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc, utcToBusinessParts } from "../../../../../utils/dateUtils";
import { AppError } from "../../../../../core/errors/AppError";
import { resolvePublicAppUrl } from "../../../../../core/utils/publicUrl";
import { IToken } from "../../../../interfaces/IToken.interface";
import { QuotationPublicLinkModel } from "../../model/quotation_public_link.model";
import { QuotationModel } from "../../model/quotation.model";
import { isOutOfReadScope } from "../shared/quotation_scope";

// 16 bytes aleatorios en base64url = 22 caracteres: imposible de adivinar
// (con el número de la cotización, cualquiera vería las de otros clientes).
export const generatePublicCode = (): string => randomBytes(16).toString("base64url");

export const buildPublicQuotationUrl = (code: string): string => `${resolvePublicAppUrl()}/c/${code}`;

export interface PublicLinkDto {
  url: string;
  enabled: boolean;
  viewCount: number;
  firstViewedAt: { date: string; time: string } | null;
  lastViewedAt: { date: string; time: string } | null;
}

export const toPublicLinkDto = (link: QuotationPublicLinkModel): PublicLinkDto => ({
  url: buildPublicQuotationUrl(link.code),
  enabled: Boolean(link.enabled),
  viewCount: Number(link.view_count),
  firstViewedAt: link.first_viewed_at ? utcToBusinessParts(link.first_viewed_at) : null,
  lastViewedAt: link.last_viewed_at ? utcToBusinessParts(link.last_viewed_at) : null,
});

/** La cotización, si el usuario puede verla (empresa y tienda); si no, 404/403. */
export async function findReadableQuotation(quotationId: number, user: IToken): Promise<QuotationModel> {
  const quotation = await DataBase.instance.quotation.findOne({ where: { id: quotationId, is_deleted: false } });
  if (!quotation) throw new AppError(404, "La cotización no existe");
  if (isOutOfReadScope(quotation, user)) throw new AppError(403, "No tienes acceso a esta cotización");
  return quotation;
}

// Una cotización "Pendiente de cotizar" (pedido de la web sin completar) no
// tiene productos ni precios definitivos: no se le muestra al cliente.
export function assertShareable(quotation: Pick<QuotationModel, "status">): void {
  if (quotation.status !== "quote_requested") return;
  throw new AppError(
    409,
    "Completa la cotización antes de compartirla con el cliente",
    undefined,
    "QUOTATION_INCOMPLETE"
  );
}

/**
 * El enlace de la cotización; se crea la primera vez que se comparte (nace
 * encendido). Si dos personas lo piden a la vez, el índice único decide y la
 * segunda lee el que creó la primera.
 */
export async function ensurePublicLink(
  quotation: Pick<QuotationModel, "id" | "company_id">,
  actorId: number,
  transaction?: Transaction
): Promise<QuotationPublicLinkModel> {
  const existing = await DataBase.instance.quotation_public_link.findOne({
    where: { quotation_id: quotation.id },
    transaction,
  });
  if (existing) return existing;

  const now = nowUtc();
  try {
    return await DataBase.instance.quotation_public_link.create(
      {
        id: 0,
        company_id: quotation.company_id,
        quotation_id: quotation.id,
        code: generatePublicCode(),
        enabled: true,
        view_count: 0,
        first_viewed_at: null,
        last_viewed_at: null,
        regenerated_at: null,
        created_by: actorId,
        created_at: now,
        updated_by: actorId,
        updated_at: now,
      },
      { transaction }
    );
  } catch (error: unknown) {
    if (!(error instanceof UniqueConstraintError)) throw error;
    const created = await DataBase.instance.quotation_public_link.findOne({
      where: { quotation_id: quotation.id },
      transaction,
    });
    if (!created) throw error;
    return created;
  }
}
