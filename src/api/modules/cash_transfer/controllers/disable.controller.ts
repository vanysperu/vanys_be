import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveWriteScope } from "../../../../core/rbac/writeScope";
import { disableCashTransferService } from "../services/disable/disable.service";

// PUT /cash-movement/transfer/disable/:id — anula o reactiva (soft-delete).
// El alcance (empresa/tienda) se valida en el service con la fila bloqueada.
export const disableCashTransferController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  const transfer = await disableCashTransferService({
    transferId: Number(req.params.id),
    scope: resolveWriteScope(user),
    actorId: user.userId,
  });

  ok(res, 200, transfer, transfer.is_deleted ? "Transferencia anulada" : "Transferencia reactivada");
});
