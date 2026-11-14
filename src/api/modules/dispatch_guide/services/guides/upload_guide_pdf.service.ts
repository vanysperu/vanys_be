import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import type { GuideDto, GuideFileInput } from "../../types/dispatch_guide.types";
import { saveGuidePdf } from "./guide_file";
import { loadGuideForCaller, toGuideDto } from "./guide_shared";

// Sube o reemplaza el PDF de una guía (borrador o registrada; una anulada ya no).
export const uploadGuidePdfService = async (id: number, file: GuideFileInput, user: IToken): Promise<GuideDto> =>
  DataBase.instance.sequelize.transaction(async (transaction) => {
    const guide = await loadGuideForCaller(id, user, "write", transaction);
    if (guide.status === "voided") throw new AppError(409, "La guía está anulada", undefined, "GUIDE_VOIDED");
    await saveGuidePdf({ guideId: Number(guide.id), companyId: Number(guide.company_id), file, actorId: user.userId, transaction });
    return toGuideDto(guide, transaction);
  });
