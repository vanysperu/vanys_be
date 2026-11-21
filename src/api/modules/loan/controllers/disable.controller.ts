import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { toggleLoanService } from "../services/disable.service";

// PUT /api/loan/disable/:id — anula o restaura un préstamo (soft).
export const toggleLoanController = asyncHandler(async (req: Request, res: Response) => {
  const loan = await toggleLoanService(Number(req.params.id), req.user as IToken);
  ok(res, 200, loan, loan.active ? "Préstamo restaurado" : "Préstamo anulado");
});
