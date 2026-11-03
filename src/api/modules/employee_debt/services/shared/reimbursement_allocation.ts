// Reparto de una reposición corregida entre las deudas del trabajador. Es una
// función PURA (sin base de datos), en céntimos enteros: el service le pasa
// lo que leyó con las filas bloqueadas y escribe el resultado. El frontend
// replica exactamente esta regla para la vista previa del diálogo
// (grulla_fe: modules/employeeDebts/utils/reimbursementAllocation.ts).
//
// Regla (decidida con el usuario):
//   - BAJAR el monto: se achican las asignaciones de ESTA reposición
//     empezando por la deuda creada más recientemente (LIFO). Una asignación
//     que llega a 0 se elimina (la foto completa queda en el historial).
//   - SUBIR el monto: primero se completan las deudas que esta reposición ya
//     cubre (la más antigua primero) y después las demás deudas pendientes
//     del trabajador (FIFO, igual que al reponer). Si no alcanza lo
//     pendiente, no se reparte nada (el caller responde 400).

export interface CoveredDebt {
  debtId: number;
  // Lo que esta reposición le cubre hoy.
  currentCents: number;
  // Lo que todavía se le puede cubrir a la deuda: monto − lo repuesto
  // vigente (de todas las reposiciones).
  roomCents: number;
}

export interface CandidateDebt {
  debtId: number;
  roomCents: number;
}

export interface ReallocationInput {
  // Deudas que esta reposición ya cubre, de la más antigua a la más nueva
  // (created_at, id ascendente).
  covered: readonly CoveredDebt[];
  // Otras deudas pendientes del trabajador, en el mismo orden (FIFO).
  candidates: readonly CandidateDebt[];
  targetCents: number;
}

export interface AllocationChange {
  debtId: number;
  beforeCents: number;
  afterCents: number;
}

export type ReallocationResult =
  | { ok: true; changes: AllocationChange[] }
  // Lo máximo que podría valer la reposición con lo pendiente de hoy.
  | { ok: false; maxCents: number };

const sumCents = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

// Achica empezando por la más nueva. reduceRight acumula de la última a la
// primera sin mutar el arreglo recibido.
const shrink = (covered: readonly CoveredDebt[], cents: number): AllocationChange[] => {
  const { changes } = covered.reduceRight<{ remaining: number; changes: AllocationChange[] }>(
    (state, debt) => {
      const taken = Math.min(debt.currentCents, state.remaining);
      const change = { debtId: debt.debtId, beforeCents: debt.currentCents, afterCents: debt.currentCents - taken };
      return { remaining: state.remaining - taken, changes: [change, ...state.changes] };
    },
    { remaining: cents, changes: [] }
  );
  return changes;
};

// Completa en orden (FIFO): primero las ya cubiertas, después las demás.
const grow = (input: ReallocationInput, cents: number): AllocationChange[] => {
  const slots = [
    ...input.covered.map((debt) => ({ debtId: debt.debtId, beforeCents: debt.currentCents, roomCents: debt.roomCents })),
    ...input.candidates.map((debt) => ({ debtId: debt.debtId, beforeCents: 0, roomCents: debt.roomCents })),
  ];
  const { changes } = slots.reduce<{ remaining: number; changes: AllocationChange[] }>(
    (state, slot) => {
      const added = Math.min(Math.max(slot.roomCents, 0), state.remaining);
      const change = { debtId: slot.debtId, beforeCents: slot.beforeCents, afterCents: slot.beforeCents + added };
      return { remaining: state.remaining - added, changes: [...state.changes, change] };
    },
    { remaining: cents, changes: [] }
  );
  return changes;
};

export function planReallocation(input: ReallocationInput): ReallocationResult {
  const currentCents = sumCents(input.covered.map((debt) => debt.currentCents));
  const delta = input.targetCents - currentCents;

  if (delta <= 0) return { ok: true, changes: shrink(input.covered, -delta) };

  const maxCents =
    currentCents +
    sumCents(input.covered.map((debt) => Math.max(debt.roomCents, 0))) +
    sumCents(input.candidates.map((debt) => Math.max(debt.roomCents, 0)));
  if (input.targetCents > maxCents) return { ok: false, maxCents };

  return { ok: true, changes: grow(input, delta) };
}
