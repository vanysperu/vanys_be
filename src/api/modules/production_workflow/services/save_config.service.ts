import { Op, Transaction } from "sequelize";
import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { nowUtc } from "../../../../utils/dateUtils";
import { ensureCompanyWorkflow } from "./shared/workflow_store";
import { getWorkflowConfigService } from "./get_config.service";
import type { ProductionWorkflowStageModel } from "../model/production_workflow_stage.model";
import type { SaveWorkflowConfigInput, SaveWorkflowStageInput, WorkflowConfigDto } from "../types/production_workflow.types";

// Un tablero con más columnas ya no entra en pantalla ni se usa en la práctica.
export const MAX_ACTIVE_STAGES = 12;
// Tope total (activas + inactivas): las inactivas se guardan por el historial.
export const MAX_TOTAL_STAGES = 40;

const normalizeName = (name: string) => name.trim().toLocaleLowerCase("es");

// Validaciones de forma que no necesitan la base: cantidad de columnas,
// al menos una activa y sin nombres repetidos entre las activas.
const assertStagesShape = (stages: readonly SaveWorkflowStageInput[]) => {
  if (stages.length > MAX_TOTAL_STAGES) throw new AppError(400, `El flujo admite hasta ${MAX_TOTAL_STAGES} columnas en total`);

  const active = stages.filter((stage) => stage.active);
  if (active.length === 0) throw new AppError(400, "El flujo necesita al menos una columna activa");
  if (active.length > MAX_ACTIVE_STAGES) throw new AppError(400, `El tablero admite hasta ${MAX_ACTIVE_STAGES} columnas activas`);

  const names = active.map((stage) => normalizeName(stage.name));
  const repeated = names.find((name, index) => names.indexOf(name) !== index);
  if (repeated) throw new AppError(400, `Hay dos columnas activas con el nombre "${repeated}"`);
};

// Las columnas no se borran (hay historial que las usa): cada columna que ya
// existe tiene que venir en la lista, una sola vez, y ninguna puede ser de
// otra empresa.
const assertSameStageSet = (existing: readonly ProductionWorkflowStageModel[], stages: readonly SaveWorkflowStageInput[]) => {
  const existingIds = new Set(existing.map((stage) => Number(stage.id)));
  const sentIds = stages.flatMap((stage) => (stage.id ? [Number(stage.id)] : []));

  const unknown = sentIds.find((id) => !existingIds.has(id));
  if (unknown !== undefined) throw new AppError(400, "Una de las columnas no pertenece al flujo de esta empresa");
  if (new Set(sentIds).size !== sentIds.length) throw new AppError(400, "Una columna viene repetida");
  if (sentIds.length !== existingIds.size) {
    throw new AppError(400, "Faltan columnas: las columnas no se eliminan, se desactivan");
  }
};

interface ItemRef {
  id: number;
  quotation_id: number;
}

// Productos de la empresa que hoy están en una columna.
const findItemsInStage = async (companyId: number, stageId: number, transaction: Transaction): Promise<ItemRef[]> => {
  const items = await DataBase.instance.quotation_item.findAll({
    attributes: ["id", "quotation_id"],
    include: [{ model: DataBase.instance.quotation, attributes: [], where: { company_id: companyId }, required: true }],
    where: { stage_id: stageId },
    transaction,
  });
  return items.map((item) => ({ id: Number(item.id), quotation_id: Number(item.quotation_id) }));
};

interface StageMove {
  fromStageId: number;
  toStageId: number;
}

// Columnas que pasan de activas a inactivas con productos adentro: el admin
// tiene que elegir a qué columna activa (ya existente) se mueven.
const resolveStageMoves = async (
  companyId: number,
  existing: readonly ProductionWorkflowStageModel[],
  stages: readonly SaveWorkflowStageInput[],
  transaction: Transaction
): Promise<Array<StageMove & { items: ItemRef[] }>> => {
  const wasActive = new Map(existing.map((stage) => [Number(stage.id), Boolean(stage.active)]));
  const activeExistingIds = new Set(stages.flatMap((stage) => (stage.id && stage.active ? [Number(stage.id)] : [])));

  const deactivated = stages.filter((stage) => stage.id && !stage.active && wasActive.get(Number(stage.id)));
  const moves: Array<StageMove & { items: ItemRef[] }> = [];

  for (const stage of deactivated) {
    const fromStageId = Number(stage.id);
    const items = await findItemsInStage(companyId, fromStageId, transaction);
    if (items.length === 0) continue;

    const toStageId = Number(stage.moveItemsToStageId);
    if (!activeExistingIds.has(toStageId)) {
      throw new AppError(
        400,
        `La columna "${stage.name.trim()}" tiene ${items.length} producto(s): elige a qué columna activa pasan antes de desactivarla`
      );
    }
    moves.push({ fromStageId, toStageId, items });
  }
  return moves;
};

// Mueve los productos de las columnas desactivadas y deja el movimiento en el
// historial de cada producto (quotation_item_stage_log), igual que si lo
// hubieran arrastrado en el tablero.
const applyStageMoves = async (
  companyId: number,
  moves: ReadonlyArray<StageMove & { items: ItemRef[] }>,
  actorId: number,
  transaction: Transaction
) => {
  const now = nowUtc();
  for (const move of moves) {
    await DataBase.instance.quotation_item.update(
      { stage_id: move.toStageId, updated_by: actorId, updated_at: now },
      { where: { id: { [Op.in]: move.items.map((item) => item.id) } }, transaction }
    );
    await DataBase.instance.quotation_item_stage_log.bulkCreate(
      move.items.map((item) => ({
        id: 0,
        company_id: companyId,
        quotation_id: item.quotation_id,
        quotation_item_id: item.id,
        from_stage_id: move.fromStageId,
        to_stage_id: move.toStageId,
        created_by: actorId,
        created_at: now,
        updated_by: actorId,
        updated_at: now,
      })),
      { transaction }
    );
  }
};

// Solo se actualizan las columnas que cambiaron: así created/updated_by
// sigue diciendo quién tocó cada una de verdad.
const stageChanged = (current: ProductionWorkflowStageModel, next: SaveWorkflowStageInput, position: number) =>
  current.name !== next.name.trim() ||
  current.color.toUpperCase() !== next.color.toUpperCase() ||
  current.category !== next.category ||
  Boolean(current.active) !== next.active ||
  current.position !== position;

const upsertStages = async (
  companyId: number,
  existing: readonly ProductionWorkflowStageModel[],
  stages: readonly SaveWorkflowStageInput[],
  actorId: number,
  transaction: Transaction
) => {
  const byId = new Map(existing.map((stage) => [Number(stage.id), stage]));
  const now = nowUtc();

  for (const [position, stage] of stages.entries()) {
    const values = {
      name: stage.name.trim(),
      color: stage.color.toUpperCase(),
      category: stage.category,
      active: stage.active,
      position,
    };
    const current = stage.id ? byId.get(Number(stage.id)) : undefined;

    if (!current) {
      await DataBase.instance.production_workflow_stage.create(
        {
          id: 0,
          company_id: companyId,
          ...values,
          legacy_variable_id: null,
          created_by: actorId,
          created_at: now,
          updated_by: actorId,
          updated_at: now,
        },
        { transaction }
      );
      continue;
    }

    if (!stageChanged(current, stage, position)) continue;
    await DataBase.instance.production_workflow_stage.update(
      { ...values, updated_by: actorId, updated_at: now },
      { where: { id: current.id, company_id: companyId }, transaction }
    );
  }
};

// Guarda el flujo completo de la empresa (reglas + columnas en orden) en una
// sola transacción: si algo falla, no queda un tablero a medio reordenar ni
// productos movidos a medias.
export const saveWorkflowConfigService = async (input: SaveWorkflowConfigInput): Promise<WorkflowConfigDto> => {
  assertStagesShape(input.stages);

  await DataBase.instance.sequelize.transaction(async (transaction) => {
    const { workflow } = await ensureCompanyWorkflow(input.companyId, input.actorId, transaction);
    // Bloquea la configuración: dos admins guardando a la vez no se pisan a medias.
    await DataBase.instance.production_workflow.findOne({
      where: { id: workflow.id },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    const existing = await DataBase.instance.production_workflow_stage.findAll({
      where: { company_id: input.companyId },
      transaction,
    });

    assertSameStageSet(existing, input.stages);
    const moves = await resolveStageMoves(input.companyId, existing, input.stages, transaction);

    await upsertStages(input.companyId, existing, input.stages, input.actorId, transaction);
    await applyStageMoves(input.companyId, moves, input.actorId, transaction);

    await DataBase.instance.production_workflow.update(
      {
        flow_mode: input.flowMode,
        allow_backward: input.allowBackward,
        updated_by: input.actorId,
        updated_at: nowUtc(),
      },
      { where: { id: workflow.id }, transaction }
    );
  });

  return getWorkflowConfigService(input.companyId, input.actorId);
};
