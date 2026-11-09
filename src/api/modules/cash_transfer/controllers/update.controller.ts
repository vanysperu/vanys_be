import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveWriteScope } from "../../../../core/rbac/writeScope";
import { UpdateCashTransferChanges } from "../types/cash_transfer.types";
import { updateCashTransferService } from "../services/update/update.service";

// Campo ausente en el body = no se toca; null en una cuenta = Efectivo.
const pick = <T>(body: Record<string, unknown>, field: string, map: (value: unknown) => T): T | undefined =>
  field in body ? map(body[field]) : undefined;

const toAccountId = (value: unknown): number | null => (value === null || value === "" ? null : Number(value));
const toText = (value: unknown): string | null => (typeof value === "string" ? value : null);

// PUT /cash-movement/transfer/update/:id — lista blanca explícita de campos,
// nunca `req.body` entero.
export const updateCashTransferController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const body = (req.body ?? {}) as Record<string, unknown>;

  const changes: UpdateCashTransferChanges = {
    amount: pick(body, "amount", Number),
    occurred_at: pick(body, "occurred_at", String),
    from_payment_account_id: pick(body, "from_payment_account_id", toAccountId),
    to_payment_account_id: pick(body, "to_payment_account_id", toAccountId),
    description: pick(body, "description", toText),
    operation_number: pick(body, "operation_number", toText),
  };

  const transfer = await updateCashTransferService({
    transferId: Number(req.params.id),
    changes,
    reason: String(body.reason).trim(),
    scope: resolveWriteScope(user),
    actorId: user.userId,
  });

  ok(res, 200, transfer, "Transferencia corregida correctamente");
});
