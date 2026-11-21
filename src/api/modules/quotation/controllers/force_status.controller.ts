import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { QuotationStatus } from "../model/quotation.model";
import { assertQuotationWritable } from "../services/shared/quotation_scope";
import { forceQuotationStatus } from "../services/update/force_status.service";
import { QuotationHasMoneyInvolvedError } from "../services/update/quotation.service";

// PUT /quotation/force-status/:id { status, note? }
// Un administrador mueve la cotización a cualquier estado (pedido del
// usuario, 21-nov). El permiso es el botón RBAC `cotizacion.forceStatus.button`
// (solo admins y Super Admin); además, solo en cotizaciones de su alcance de
// escritura (un admin ligado a una tienda, solo en la suya).
export const forceQuotationStatusController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const quotationId = Number(req.params.id);
  const { status, note } = req.body as { status: QuotationStatus; note?: string | null };

  await assertQuotationWritable(quotationId, user, "cambiar el estado");

  try {
    const result = await forceQuotationStatus({ quotationId, nextStatus: status, note: note ?? null, actorId: user.userId });
    ok(res, 200, result, "Estado actualizado correctamente");
  } catch (err: unknown) {
    // La regla del dinero se comparte con el flujo normal y lanza su propio
    // error: se traduce al formato estándar con un código estable.
    if (err instanceof QuotationHasMoneyInvolvedError) throw new AppError(409, err.message, undefined, "QUOTATION_HAS_MONEY");
    throw err;
  }
});
