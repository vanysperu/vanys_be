import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { toNullableText } from "../../money_correction/services/shared/correction_diff";
import { updateLoanService } from "../services/update.service";
import { UpdateLoanInput } from "../types/loan.types";

// Solo lo que vino en el body (undefined = no se toca); "" o null = se borra.
const optionalText = (body: Record<string, unknown>, key: string): string | null | undefined =>
  key in body ? toNullableText(body[key] as string | null | undefined) : undefined;

// PUT /api/loan/update/:id — corrige un préstamo.
export const updateLoanController = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const input: UpdateLoanInput = {
    borrowerName: typeof body.borrower_name === "string" ? body.borrower_name.trim() : undefined,
    borrowerDocument: optionalText(body, "borrower_document"),
    borrowerPhone: optionalText(body, "borrower_phone"),
    notes: optionalText(body, "notes"),
    dueDate: "due_date" in body ? ((body.due_date as string | null) || null) : undefined,
    principal: body.principal !== undefined ? Number(body.principal) : undefined,
    interestRate: body.interest_rate !== undefined ? Number(body.interest_rate) : undefined,
    loanedAt: typeof body.loaned_at === "string" ? body.loaned_at : undefined,
    paymentAccountId: "payment_account_id" in body ? ((body.payment_account_id as number | null) ?? null) : undefined,
    operationNumber: optionalText(body, "operation_number"),
  };
  const loan = await updateLoanService(Number(req.params.id), input, req.user as IToken);
  ok(res, 200, loan, "Préstamo actualizado correctamente");
});
