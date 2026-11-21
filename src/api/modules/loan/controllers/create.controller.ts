import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveTargetCompanyId } from "../../../../core/rbac/companyScope";
import { resolveTargetBusinessUnitId } from "../../../../core/rbac/businessUnitScope";
import { resolveWriteScope } from "../../../../core/rbac/writeScope";
import { resolvePaymentAccountId } from "../../variable_general/services/shared/payment_account.service";
import { toNullableText } from "../../money_correction/services/shared/correction_diff";
import { createLoanService } from "../services/create.service";

// POST /api/loan/create — registra un préstamo (sale de Caja ese día).
// Empresa y tienda salen SIEMPRE de la sesión (CLAUDE.md §10 y §11.1): solo el
// Super Administrador elige la empresa y solo quien no tiene tienda propia
// elige la tienda (validada contra la empresa). Mismo criterio que Caja.
export const createLoanController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const writeScope = resolveWriteScope(user);
  const companyId = await resolveTargetCompanyId(user, req.body.company_id, "préstamos");
  const businessUnitId = writeScope.businessUnitId ?? (await resolveTargetBusinessUnitId(user, req.body.business_unit_id, companyId));
  const paymentAccountId = await resolvePaymentAccountId({ accountId: req.body.payment_account_id, companyId, required: false });

  const loan = await createLoanService({
    companyId,
    businessUnitId,
    borrowerName: String(req.body.borrower_name).trim(),
    borrowerDocument: toNullableText(req.body.borrower_document),
    borrowerPhone: toNullableText(req.body.borrower_phone),
    principal: Number(req.body.principal),
    interestRate: Number(req.body.interest_rate),
    loanedAt: req.body.loaned_at,
    dueDate: req.body.due_date || null,
    paymentAccountId,
    operationNumber: toNullableText(req.body.operation_number),
    notes: toNullableText(req.body.notes),
    actorId: user.userId,
  });
  ok(res, 201, loan, "Préstamo registrado correctamente");
});
