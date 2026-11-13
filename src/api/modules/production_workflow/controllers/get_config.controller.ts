import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getWorkflowConfigService } from "../services/get_config.service";
import { resolveWorkflowCompanyId } from "../services/shared/workflow_company";

// GET /api/production-workflow/config — pantalla "Flujo de producción".
export const getWorkflowConfigController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveWorkflowCompanyId(user, req.query.companyId);
  const config = await getWorkflowConfigService(companyId, user.userId);
  ok(res, 200, config);
});
