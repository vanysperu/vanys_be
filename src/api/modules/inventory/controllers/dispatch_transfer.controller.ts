import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { dispatchTransferService } from "../services/documents/dispatch_transfer.service";

// POST /api/inventory/documents/:id/dispatch — la transferencia sale (queda en tránsito)
export const dispatchTransferController = asyncHandler(async (req: Request, res: Response) => {
  ok(res, 200, await dispatchTransferService(Number(req.params.id), req.user as IToken), "Transferencia despachada");
});
