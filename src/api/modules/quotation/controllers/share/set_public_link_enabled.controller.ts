import { Request, Response } from "express";
import { IToken } from "../../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../../core/utils/asyncHandler";
import { ok } from "../../../../../core/utils/response";
import { setPublicLinkEnabledService } from "../../services/share/set_public_link_enabled.service";

// PUT /api/quotation/:id/public-link { enabled } — interruptor "Visible para el cliente".
export const setPublicLinkEnabledController = asyncHandler(async (req: Request, res: Response) => {
  const enabled = Boolean(req.body.enabled);
  const link = await setPublicLinkEnabledService(Number(req.params.id), enabled, req.user as IToken);
  ok(res, 200, link, enabled ? "El cliente puede ver la cotización" : "El cliente ya no puede ver la cotización");
});
