import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { disableLoanPaymentService } from "../services/disable_payment.service";

// PUT /api/loan/payment/disable/:paymentId — anula un cobro (soft, de una sola vía).
export const disableLoanPaymentController = asyncHandler(async (req: Request, res: Response) => {
  const loan = await disableLoanPaymentService(Number(req.params.paymentId), req.user as IToken);
  ok(res, 200, loan, "Cobro anulado");
});
