import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { toNullableText } from "../../money_correction/services/shared/correction_diff";
import { createLoanPaymentService } from "../services/create_payment.service";

// POST /api/loan/:id/payment — registra un cobro (entra a Caja ese día).
export const createLoanPaymentController = asyncHandler(async (req: Request, res: Response) => {
  const loan = await createLoanPaymentService(
    Number(req.params.id),
    {
      amount: Number(req.body.amount),
      paidAt: req.body.paid_at,
      paymentAccountId: req.body.payment_account_id ?? null,
      operationNumber: toNullableText(req.body.operation_number),
      notes: toNullableText(req.body.notes),
    },
    req.user as IToken
  );
  ok(res, 201, loan, "Cobro registrado correctamente");
});
