import { Transaction, UniqueConstraintError } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import type { ProductionWorkflowModel } from "../../model/production_workflow.model";
import type { ProductionWorkflowStageModel, StageCategory } from "../../model/production_workflow_stage.model";

// Columnas con las que nace el flujo de una empresa que todavía no tiene
// (empresas creadas después de la migración 20261113120000): las mismas 4 que
// antes eran globales en Variables Generales.
const DEFAULT_STAGES: ReadonlyArray<{ name: string; color: string; category: StageCategory }> = [
  { name: "Diseño", color: "#7A5AF8", category: "todo" },
  { name: "Insumos", color: "#C7861B", category: "doing" },
  { name: "Producción", color: "#1F5FC0", category: "doing" },
  { name: "Listo", color: "#1F8A5F", category: "done" },
];

export interface CompanyWorkflow {
  workflow: ProductionWorkflowModel;
  // Todas las columnas (activas e inactivas), por posición.
  stages: ProductionWorkflowStageModel[];
}

const findStages = (companyId: number, transaction?: Transaction) =>
  DataBase.instance.production_workflow_stage.findAll({
    where: { company_id: companyId },
    order: [
      ["position", "ASC"],
      ["id", "ASC"],
    ],
    transaction,
  });

// Crea la configuración y las columnas por defecto si la empresa no las tiene.
// Dos requests a la vez pueden intentar crearla: el UNIQUE de company_id deja
// pasar solo a uno y el otro relee lo que creó el primero.
const createDefaultWorkflow = async (companyId: number, actorId: number | null, transaction?: Transaction) => {
  const now = nowUtc();
  try {
    const workflow = await DataBase.instance.production_workflow.create(
      {
        id: 0,
        company_id: companyId,
        flow_mode: "linear",
        allow_backward: true,
        created_by: actorId,
        created_at: now,
        updated_by: actorId,
        updated_at: now,
      },
      { transaction }
    );
    return workflow;
  } catch (error: unknown) {
    if (!(error instanceof UniqueConstraintError)) throw error;
    const existing = await DataBase.instance.production_workflow.findOne({ where: { company_id: companyId }, transaction });
    if (!existing) throw error;
    return existing;
  }
};

const createDefaultStages = async (companyId: number, actorId: number | null, transaction?: Transaction) => {
  const now = nowUtc();
  await DataBase.instance.production_workflow_stage.bulkCreate(
    DEFAULT_STAGES.map((stage, index) => ({
      id: 0,
      company_id: companyId,
      name: stage.name,
      color: stage.color,
      position: index,
      category: stage.category,
      active: true,
      legacy_variable_id: null,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    })),
    { transaction }
  );
};

// Bloquea la fila de configuración antes de volver a contar: así dos requests
// simultáneos no crean las columnas por defecto dos veces.
const seedStagesOnce = async (companyId: number, actorId: number | null, transaction?: Transaction): Promise<void> => {
  const run = async (tx: Transaction) => {
    await DataBase.instance.production_workflow.findOne({ where: { company_id: companyId }, lock: tx.LOCK.UPDATE, transaction: tx });
    const count = await DataBase.instance.production_workflow_stage.count({ where: { company_id: companyId }, transaction: tx });
    if (count > 0) return;
    await createDefaultStages(companyId, actorId, tx);
  };
  if (transaction) return run(transaction);
  return DataBase.instance.sequelize.transaction(run);
};

export const ensureCompanyWorkflow = async (
  companyId: number,
  actorId: number | null,
  transaction?: Transaction
): Promise<CompanyWorkflow> => {
  const workflow =
    (await DataBase.instance.production_workflow.findOne({ where: { company_id: companyId }, transaction })) ??
    (await createDefaultWorkflow(companyId, actorId, transaction));

  const stages = await findStages(companyId, transaction);
  if (stages.length > 0) return { workflow, stages };

  await seedStagesOnce(companyId, actorId, transaction);
  return { workflow, stages: await findStages(companyId, transaction) };
};

// Columnas activas de la empresa, en orden: las que se ven en el tablero.
export const getActiveStages = async (companyId: number, transaction?: Transaction) => {
  const { stages } = await ensureCompanyWorkflow(companyId, null, transaction);
  return stages.filter((stage) => stage.active);
};
