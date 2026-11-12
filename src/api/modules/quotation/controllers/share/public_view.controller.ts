import { Request, Response } from "express";
import { asyncHandler } from "../../../../../core/utils/asyncHandler";
import { ok } from "../../../../../core/utils/response";
import { getPublicQuotationView } from "../../services/share/public_view.service";

// Que la cotización de un cliente no aparezca en buscadores ni se guarde en
// cachés compartidas.
export const setPrivatePageHeaders = (res: Response) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
};

// GET /api/public/q/:code — PÚBLICO (sin sesión ni API key, con límite por IP).
// Solo lectura y solo los datos del PDF (ver public_view.service.ts).
export const publicQuotationViewController = asyncHandler(async (req: Request, res: Response) => {
  setPrivatePageHeaders(res);
  const view = await getPublicQuotationView(String(req.params.code));
  ok(res, 200, view);
});
