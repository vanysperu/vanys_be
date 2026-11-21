import { Request, Response } from "express";
import { IToken } from "../../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../../core/utils/asyncHandler";
import { ok } from "../../../../../core/utils/response";
import { disableMockupService } from "../../services/mockup/disable_mockup.service";

// PATCH /quotation/mockup/:mockupId/disable — quita un diseño (soft-delete).
export const disableMockupController = asyncHandler(async (req: Request, res: Response) => {
  const result = await disableMockupService(Number(req.params.mockupId), req.user as IToken);
  ok(res, 200, result, "Diseño quitado");
});
