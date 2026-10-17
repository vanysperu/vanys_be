import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getMyAccess } from "../services/find/access.service";

export const getMyAccessController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const access = await getMyAccess(user.userId, user.companyId, user.businessUnitId);

  ok(res, 200, access, "Accesos obtenidos correctamente");
});
