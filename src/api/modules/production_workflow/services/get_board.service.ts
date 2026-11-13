import { ensureCompanyWorkflow } from "./shared/workflow_store";
import type { WorkflowBoardDto } from "../types/production_workflow.types";

// Lo que necesita el kanban de una cotización: reglas de movimiento + solo las
// columnas activas, en orden. Lo puede leer cualquiera que vea cotizaciones
// (no es la pantalla de configuración).
export const getWorkflowBoardService = async (companyId: number): Promise<WorkflowBoardDto> => {
  const { workflow, stages } = await ensureCompanyWorkflow(companyId, null);

  return {
    flowMode: workflow.flow_mode,
    allowBackward: Boolean(workflow.allow_backward),
    stages: stages
      .filter((stage) => stage.active)
      .map((stage) => ({
        id: Number(stage.id),
        name: stage.name,
        color: stage.color,
        position: stage.position,
        category: stage.category,
        active: true,
      })),
  };
};
