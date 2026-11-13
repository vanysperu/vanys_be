import { Op, col, fn } from "sequelize";
import { DataBase } from "../../../../database";
import { ensureCompanyWorkflow } from "./shared/workflow_store";
import type { WorkflowConfigDto } from "../types/production_workflow.types";

interface StageCountRow {
  stage_id: number;
  total: number | string;
}

// Productos por columna (todas las cotizaciones de la empresa, en un solo
// GROUP BY — nada de una consulta por columna).
const countItemsByStage = async (companyId: number): Promise<Map<number, number>> => {
  const rows = (await DataBase.instance.quotation_item.findAll({
    attributes: ["stage_id", [fn("COUNT", col("quotation_item.id")), "total"]],
    include: [{ model: DataBase.instance.quotation, attributes: [], where: { company_id: companyId }, required: true }],
    where: { stage_id: { [Op.ne]: null } },
    group: [col("quotation_item.stage_id")],
    raw: true,
  })) as unknown as StageCountRow[];
  return new Map(rows.map((row) => [Number(row.stage_id), Number(row.total)]));
};

// Configuración completa del flujo de producción de una empresa (pantalla
// "Flujo de producción"): reglas + todas las columnas, también las inactivas.
export const getWorkflowConfigService = async (companyId: number, actorId: number): Promise<WorkflowConfigDto> => {
  const { workflow, stages } = await ensureCompanyWorkflow(companyId, actorId);
  const counts = await countItemsByStage(companyId);

  return {
    companyId,
    flowMode: workflow.flow_mode,
    allowBackward: Boolean(workflow.allow_backward),
    stages: stages.map((stage) => ({
      id: Number(stage.id),
      name: stage.name,
      color: stage.color,
      position: stage.position,
      category: stage.category,
      active: Boolean(stage.active),
      itemCount: counts.get(Number(stage.id)) ?? 0,
    })),
  };
};
