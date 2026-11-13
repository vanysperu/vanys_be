import type { FlowMode } from "../model/production_workflow.model";
import type { StageCategory } from "../model/production_workflow_stage.model";

// Columna del kanban de producción tal como la ve el frontend.
export interface WorkflowStageDto {
  id: number;
  name: string;
  color: string;
  position: number;
  category: StageCategory;
  active: boolean;
}

// En la pantalla de configuración cada columna muestra cuántos productos
// tiene: con eso el admin sabe si al desactivarla tiene que moverlos.
export interface WorkflowStageWithCountDto extends WorkflowStageDto {
  itemCount: number;
}

export interface WorkflowRulesDto {
  flowMode: FlowMode;
  allowBackward: boolean;
}

export interface WorkflowConfigDto extends WorkflowRulesDto {
  companyId: number;
  stages: WorkflowStageWithCountDto[];
}

// Lo que necesita el tablero: las reglas (para saber a qué columnas se puede
// soltar un producto) y solo las columnas activas, en orden.
export interface WorkflowBoardDto extends WorkflowRulesDto {
  stages: WorkflowStageDto[];
}

export interface SaveWorkflowStageInput {
  // Sin id = columna nueva.
  id?: number | null;
  name: string;
  color: string;
  category: StageCategory;
  active: boolean;
  // Si la columna queda desactivada y tiene productos: columna (activa, ya
  // existente) a la que pasan.
  moveItemsToStageId?: number | null;
}

export interface SaveWorkflowConfigInput extends WorkflowRulesDto {
  companyId: number;
  // El orden del arreglo es el orden de las columnas.
  stages: SaveWorkflowStageInput[];
  actorId: number;
}
