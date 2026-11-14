import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { registerGuideService } from "../services/guides/register_guide.service";

// POST /api/dispatch-guide/guides/:id/register (JSON o multipart con "file" opcional):
// la guía ya emitida en SUNAT, con su serie, número y, si se tiene, el PDF.
export const registerGuideController = asyncHandler(async (req: Request, res: Response) => {
  const guide = await registerGuideService(
    Number(req.params.id),
    { series: String(req.body.series), number: Number(req.body.number), issue_date: req.body.issue_date || null },
    req.file ?? null,
    req.user as IToken
  );
  ok(res, 200, guide, "Guía registrada");
});
