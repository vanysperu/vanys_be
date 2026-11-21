import { IToken } from "../../../../interfaces/IToken.interface";
import { AppError } from "../../../../../core/errors/AppError";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { logQuotationEvent } from "../timeline/quotation_event.service";
import { QuotationMockupDto, toMockupDto } from "./mockup_shared";

// Tope de diseños activos por cotización: evita que una cotización se vuelva
// pesada sin querer (cada archivo puede tener hasta 5 MB).
export const MAX_MOCKUPS_PER_QUOTATION = 40;

export interface UploadedMockupFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadMockupFields {
  quotation_item_id: number | null;
  caption: string | null;
}

/**
 * Sube un mockup a la cotización (21-nov). El archivo ya llega validado
 * (tipo, firma y tamaño) por el controller. Archivo + evento del historial en
 * una transacción: o quedan los dos, o ninguno.
 */
export async function uploadMockupService(
  quotationId: number,
  file: UploadedMockupFile,
  fields: UploadMockupFields,
  user: IToken
): Promise<QuotationMockupDto> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const quotation = await DataBase.instance.quotation.findOne({
      where: { id: quotationId, is_deleted: false },
      attributes: ["id", "company_id", "business_unit_id"],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!quotation) throw new AppError(404, "La cotización no existe", undefined, "NOT_FOUND");

    // El producto elegido tiene que ser de ESTA cotización.
    if (fields.quotation_item_id !== null) {
      const item = await DataBase.instance.quotation_item.findOne({
        where: { id: fields.quotation_item_id, quotation_id: quotationId },
        attributes: ["id"],
        transaction,
      });
      if (!item) throw new AppError(400, "El producto elegido no es de esta cotización", undefined, "MOCKUP_ITEM_INVALID");
    }

    const active = await DataBase.instance.quotation_mockup.count({ where: { quotation_id: quotationId, active: true }, transaction });
    if (active >= MAX_MOCKUPS_PER_QUOTATION) {
      throw new AppError(
        409,
        `La cotización ya tiene ${MAX_MOCKUPS_PER_QUOTATION} diseños: quita alguno antes de subir otro`,
        undefined,
        "MOCKUP_LIMIT"
      );
    }

    const now = nowUtc();
    const fileName = file.originalname.slice(0, 255) || "diseño";
    const created = await DataBase.instance.quotation_mockup.create(
      {
        id: 0,
        company_id: Number(quotation.company_id),
        business_unit_id: quotation.business_unit_id ?? null,
        quotation_id: quotationId,
        quotation_item_id: fields.quotation_item_id,
        file_name: fileName,
        mime_type: file.mimetype,
        size_bytes: file.size,
        data: file.buffer,
        caption: fields.caption,
        active: true,
        created_by: user.userId,
        created_at: now,
        updated_by: user.userId,
        updated_at: now,
      },
      { transaction }
    );

    await logQuotationEvent({
      quotationId,
      action: "mockup_added",
      description: `Se subió el diseño "${fields.caption ?? fileName}"`,
      actorId: user.userId,
      transaction,
    });

    return toMockupDto(created);
  });
}
