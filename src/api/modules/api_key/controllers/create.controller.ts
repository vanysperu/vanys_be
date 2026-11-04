import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createApiKeyService } from "../services/create.service";

// POST /api-key/create — la respuesta trae `plain_key`, que no se vuelve a
// mostrar nunca.
export const createApiKeyController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { company_id, business_unit_id, name, replicate_company_ids } = req.body;
  const created = await createApiKeyService({ company_id, business_unit_id, name, replicate_company_ids }, user.userId);
  ok(res, 201, created, "API key creada. Cópiala ahora: no se vuelve a mostrar");
});
