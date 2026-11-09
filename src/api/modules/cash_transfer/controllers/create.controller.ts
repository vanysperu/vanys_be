import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveTargetCompanyId } from "../../../../core/rbac/companyScope";
import { resolveTargetBusinessUnitId } from "../../../../core/rbac/businessUnitScope";
import { resolveWriteScope } from "../../../../core/rbac/writeScope";
import { resolvePaymentAccountId } from "../../variable_general/services/shared/payment_account.service";
import { toNullableText } from "../../money_correction/services/shared/correction_diff";
import { createCashTransferService } from "../services/create/create.service";

// POST /cash-movement/transfer/create
export const createCashTransferController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { amount, occurred_at, description, operation_number } = req.body;

  // Empresa y tienda salen SIEMPRE de la sesión (CLAUDE.md §10 y §11.1): solo
  // el Super Administrador elige la empresa y solo quien no tiene tienda propia
  // elige la tienda (validada contra la empresa). Mismo criterio que un
  // movimiento manual de Caja.
  const writeScope = resolveWriteScope(user);
  const companyId = await resolveTargetCompanyId(user, req.body.company_id, "transferencias");
  const businessUnitId =
    writeScope.businessUnitId ?? (await resolveTargetBusinessUnitId(user, req.body.business_unit_id, companyId));

  // Cada cuenta tiene que ser de la empresa y estar activa; vacía = Efectivo.
  const [fromPaymentAccountId, toPaymentAccountId] = await Promise.all([
    resolvePaymentAccountId({ accountId: req.body.from_payment_account_id, companyId, required: false }),
    resolvePaymentAccountId({ accountId: req.body.to_payment_account_id, companyId, required: false }),
  ]);

  const transfer = await createCashTransferService({
    companyId,
    businessUnitId,
    fromPaymentAccountId,
    toPaymentAccountId,
    amount: Number(amount),
    occurredAt: occurred_at,
    description: toNullableText(description),
    operationNumber: toNullableText(operation_number),
    actorId: user.userId,
  });

  ok(res, 201, transfer, "Transferencia registrada correctamente");
});
