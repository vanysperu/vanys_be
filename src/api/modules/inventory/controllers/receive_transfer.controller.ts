import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { receiveTransferService } from "../services/documents/receive_transfer.service";
import type { ReceiveLineInput } from "../types/inventory.types";

// POST /api/inventory/documents/:id/receive { lines: [{ line_id, quantity }], closeDifference }
export const receiveTransferController = asyncHandler(async (req: Request, res: Response) => {
  const { lines, closeDifference } = req.body as { lines: ReceiveLineInput[]; closeDifference?: boolean };
  const document = await receiveTransferService(Number(req.params.id), lines, closeDifference === true, req.user as IToken);
  ok(res, 200, document, document.status === "received" ? "Transferencia recibida" : "Recepción parcial registrada");
});
