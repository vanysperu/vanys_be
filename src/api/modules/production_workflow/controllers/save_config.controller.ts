import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { saveWorkflowConfigService } from "../services/save_config.service";
import type { SaveWorkflowStageInput } from "../types/production_workflow.types";
import type { FlowMode } from "../model/production_workflow.model";
import { resolveWorkflowCompanyId } from "../services/shared/workflow_company";

interface SaveWorkflowBody {
  company_id?: number | null;
  flowMode: FlowMode;
  allowBackward: boolean;
  stages: SaveWorkflowStageInput[];
}

// PUT /api/production-workflow/config — guarda reglas + columnas en orden.
export const saveWorkflowConfigController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const body = req.body as SaveWorkflowBody;
  const companyId = await resolveWorkflowCompanyId(user, body.company_id);

  // Whitelist explícito de cada columna: nunca se pasa el body tal cual.
  const stages = body.stages.map((stage) => ({
    id: stage.id ?? null,
    name: stage.name,
    color: stage.color,
    category: stage.category,
    active: stage.active,
    moveItemsToStageId: stage.moveItemsToStageId ?? null,
  }));

  const config = await saveWorkflowConfigService({
    companyId,
    flowMode: body.flowMode,
    allowBackward: body.allowBackward,
    stages,
    actorId: user.userId,
  });
  ok(res, 200, config, "Flujo de producción guardado");
});
