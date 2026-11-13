import type { WorkflowRulesDto } from "../../types/production_workflow.types";

// Movimiento no permitido por las reglas del flujo de la empresa (el
// controller lo responde como 400 con este mismo mensaje).
export class StageMoveNotAllowedError extends Error {}

interface StageRef {
  id: number;
}

// Reglas del tablero (decisión D10):
// - Libre: a cualquier columna activa.
// - Lineal: solo a la columna siguiente, o a la anterior si la empresa permite
//   retroceder.
// - Un producto sin columna (o en una columna que se desactivó) entra por la
//   primera en modo lineal.
// `activeStages` va ordenado por posición.
export const assertMoveAllowed = (
  rules: WorkflowRulesDto,
  activeStages: readonly StageRef[],
  currentStageId: number | null,
  nextStageId: number
): void => {
  const nextIndex = activeStages.findIndex((stage) => stage.id === nextStageId);
  if (nextIndex === -1) throw new StageMoveNotAllowedError("La etapa indicada no existe o está desactivada para esta empresa");
  if (rules.flowMode === "free") return;

  const currentIndex = activeStages.findIndex((stage) => stage.id === currentStageId);
  if (currentIndex === -1) {
    if (nextIndex === 0) return;
    throw new StageMoveNotAllowedError("Este producto tiene que empezar por la primera etapa del flujo");
  }

  if (nextIndex === currentIndex + 1) return;
  if (rules.allowBackward && nextIndex === currentIndex - 1) return;

  throw new StageMoveNotAllowedError(
    rules.allowBackward
      ? "Solo puedes mover un producto a la etapa inmediatamente anterior o siguiente — no se puede saltar etapas."
      : "Solo puedes mover un producto a la etapa siguiente — el flujo de tu empresa no permite saltar ni retroceder etapas."
  );
};
