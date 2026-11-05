import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import {
  CustomizationMismatchError,
  DisabledCatalogEntityError,
  MissingProductPriceError,
  MissingQuantityError,
  TenantMismatchError,
} from "../services/create/quotation.service";
import { assertQuotationWritable } from "../services/shared/quotation_scope";
import { saveQuotationItems } from "../services/update/quotation_items.service";

// PUT /quotation/:id/items — el equipo edita una cotización en cualquier
// estado: productos, técnica, modo de precio, cantidades y datos. También es
// como se completa un pedido de la web ("Pendiente de cotizar").
export const completeQuotationController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const quotationId = Number(req.params.id);

  // Mismo alcance de escritura que registrar dinero: un usuario ligado a una
  // tienda solo completa cotizaciones de su tienda.
  await assertQuotationWritable(quotationId, user, "editar cotizaciones");

  const {
    items,
    includes_delivery,
    includes_design,
    includes_igv,
    notes,
    production_days,
    billing_name,
    billing_document_number,
  } = req.body;

  try {
    const result = await saveQuotationItems({
      quotationId,
      input: {
        items,
        includes_delivery,
        includes_design,
        includes_igv,
        notes,
        production_days,
        billing_name,
        billing_document_number,
      },
      updatedBy: user.userId,
    });
    ok(res, 200, result, "Cotización guardada correctamente");
  } catch (err: unknown) {
    if (err instanceof TenantMismatchError) throw new AppError(403, err.message);
    if (
      err instanceof MissingProductPriceError ||
      err instanceof MissingQuantityError ||
      err instanceof DisabledCatalogEntityError ||
      err instanceof CustomizationMismatchError
    ) {
      throw new AppError(400, err.message);
    }
    throw err;
  }
});
