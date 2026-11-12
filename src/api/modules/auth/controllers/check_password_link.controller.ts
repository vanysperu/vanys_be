import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { checkPasswordLink } from "../services/password_link/check_password_link.service";

// POST /api/password/link/check — público. El token va en el cuerpo y no en la
// URL, para que no quede en los logs de acceso.
export const checkPasswordLinkController = asyncHandler(async (req: Request, res: Response) => {
  const result = await checkPasswordLink(String(req.body.token));
  ok(res, 200, result);
});
