import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { findLoanService } from "../services/find.service";

// GET /api/loan/find/:id — el préstamo con sus cobros.
export const findLoanController = asyncHandler(async (req: Request, res: Response) => {
  const loan = await findLoanService(Number(req.params.id), req.user as IToken);
  ok(res, 200, loan, "Préstamo obtenido correctamente");
});
