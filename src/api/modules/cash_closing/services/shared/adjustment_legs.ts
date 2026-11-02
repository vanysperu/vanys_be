import { periodOf } from "../../../../../utils/dateUtils";
import { AdjustmentLeg, CashDirection, CashEffect } from "../../types/cash_closing.types";

// Lógica PURA de las patas de ajuste (sin base de datos: se prueba con
// tests/cash-adjustment-legs.unit.test.ts). adjustment_entries.service.ts la
// re-exporta junto con el INSERT.

// Clave de agrupación de un efecto: lo que Caja distingue al sumar y filtrar.
// Categoría, descripción, notas, N° de operación y cantidad NO están: editar
// solo eso nunca genera ajuste.
export const cashEffectKey = (effect: CashEffect): string =>
  [
    effect.date,
    effect.direction,
    effect.paymentAccountId ?? "cash",
    effect.businessUnitId ?? "-",
    effect.quotationId ?? "-",
    effect.purchaseOrderId ?? "-",
  ].join("|");

// Clave de CAJA (lo que se cierra: fecha, sentido y cuenta). Si dentro de una
// clave de caja el delta total es 0, el cambio solo re-vincula el dinero
// (otra tienda, cotización u orden) sin mover caja: decisión 3 del usuario →
// corrección normal, sin patas.
const cashBoxKey = (effect: CashEffect): string =>
  [effect.date, effect.direction, effect.paymentAccountId ?? "cash"].join("|");

// Efecto de un monto en el saldo: un ingreso suma, un egreso resta.
export const netEffectCents = (direction: CashDirection, amountCents: number): number =>
  direction === "income" ? amountCents : -amountCents;

/**
 * Patas de ajuste para un cambio de `before` a `after` (efectos en caja de la
 * misma fila antes y después de corregirla/anularla/restaurarla).
 *
 * Por cada clave cuya fecha cae en un mes CERRADO (`closedPeriods`, YYYY-MM):
 * delta = Σafter − Σbefore (céntimos). Si delta ≠ 0:
 *   - hold    { fecha original, −delta }: el mes cerrado sigue sumando lo mismo;
 *   - posting { today,          +delta }: la diferencia aparece en el mes abierto.
 * Ambas con affected_period = mes de la fecha original. Claves en meses
 * abiertos, reabiertos, antes del inicio o sin libro no generan nada.
 * Tampoco las claves cuya clave de caja (fecha|sentido|cuenta) suma delta 0:
 * cambiar solo la tienda, la cotización o la orden no mueve caja.
 *
 * Ejemplo: pago de marzo (cerrado) de 100 corregido a 80 el 12/05 →
 * hold 10/03 +20, posting 12/05 −20 (ingreso).
 */
export function planAdjustmentLegs(
  before: readonly CashEffect[],
  after: readonly CashEffect[],
  closedPeriods: ReadonlySet<string>,
  today: string
): AdjustmentLeg[] {
  const groups = new Map<string, { template: CashEffect; deltaCents: number }>();
  const add = (effect: CashEffect, sign: 1 | -1) => {
    const key = cashEffectKey(effect);
    const group = groups.get(key) ?? { template: effect, deltaCents: 0 };
    groups.set(key, { template: group.template, deltaCents: group.deltaCents + sign * effect.amountCents });
  };
  before.forEach((effect) => add(effect, -1));
  after.forEach((effect) => add(effect, 1));

  const boxDeltas = new Map<string, number>();
  for (const { template, deltaCents } of groups.values()) {
    const boxKey = cashBoxKey(template);
    boxDeltas.set(boxKey, (boxDeltas.get(boxKey) ?? 0) + deltaCents);
  }

  // Orden estable por clave: el mismo cambio siempre produce las mismas patas.
  const sortedKeys = [...groups.keys()].sort();

  return sortedKeys.flatMap((key): AdjustmentLeg[] => {
    const group = groups.get(key);
    if (!group || group.deltaCents === 0) return [];
    const { template, deltaCents } = group;
    const affectedPeriod = periodOf(template.date);
    if (!closedPeriods.has(affectedPeriod)) return [];
    if (boxDeltas.get(cashBoxKey(template)) === 0) return [];

    const common = {
      affectedPeriod,
      direction: template.direction,
      paymentAccountId: template.paymentAccountId,
      businessUnitId: template.businessUnitId,
      quotationId: template.quotationId,
      purchaseOrderId: template.purchaseOrderId,
    };
    return [
      { ...common, leg: "hold", entryDate: template.date, amountCents: -deltaCents },
      { ...common, leg: "posting", entryDate: today, amountCents: deltaCents },
    ];
  });
}

// Clave de agrupación de una pata hold existente (misma forma que la de un efecto).
const legEffectKey = (leg: AdjustmentLeg): string =>
  cashEffectKey({
    date: leg.entryDate,
    direction: leg.direction,
    amountCents: leg.amountCents,
    paymentAccountId: leg.paymentAccountId,
    businessUnitId: leg.businessUnitId,
    quotationId: leg.quotationId,
    purchaseOrderId: leg.purchaseOrderId,
  });

// Meses (YYYY-MM) de `periods` donde el efecto en caja de la fila cambia de
// verdad: alguna clave de caja (fecha|sentido|cuenta) con delta ≠ 0. Solo
// re-vincular (tienda, cotización, orden) no cuenta.
const periodsWithCashDelta = (
  before: readonly CashEffect[],
  after: readonly CashEffect[],
  periods: ReadonlySet<string>
): Set<string> => {
  const boxDeltas = new Map<string, { period: string; deltaCents: number }>();
  const add = (effect: CashEffect, sign: 1 | -1) => {
    const period = periodOf(effect.date);
    if (!periods.has(period)) return;
    const boxKey = cashBoxKey(effect);
    const current = boxDeltas.get(boxKey)?.deltaCents ?? 0;
    boxDeltas.set(boxKey, { period, deltaCents: current + sign * effect.amountCents });
  };
  before.forEach((effect) => add(effect, -1));
  after.forEach((effect) => add(effect, 1));
  return new Set([...boxDeltas.values()].filter((box) => box.deltaCents !== 0).map((box) => box.period));
};

/**
 * Patas que LIBERAN las holds de la fila en un mes REABIERTO cuando su efecto
 * en caja cambia ahí (QA M1).
 *
 * Mientras el mes estuvo cerrado, cada ajuste de la fila dejó una hold en la
 * fecha original (para congelar el mes) y un posting en el mes abierto. Al
 * reabrir, el mes vuelve a reflejar la realidad: si la fila se corrige,
 * anula o restaura, el total de la fila en ese mes (vivo + holds) debe quedar
 * igual a su efecto vivo nuevo. Para eso, por cada clave con holds H ≠ 0 en
 * un mes reabierto donde la caja de la fila cambia:
 *   - hold    { fecha de la hold original, −H }: el mes reabierto suma solo lo vivo;
 *   - posting { today,                     +H }: revierte el posting original en el mes abierto.
 * Ambas con affected_period = el mes reabierto. Los meses cerrados después no
 * cambian (el posting va siempre a HOY, que nunca está cerrado).
 *
 * Ejemplo: pago de octubre (cerrado) de 100 anulado en noviembre → hold +100
 * oct, posting −100 nov. Se reabre octubre y se restaura el pago → hold −100
 * oct, posting +100 hoy: octubre suma 100 (vivo) y los ajustes netean 0.
 *
 * Si lo editado no mueve caja (descripción, notas...), las holds se quedan:
 * el mes conserva su cifra y el ajuste sigue visible donde se registró
 * (decisión 3: editar sin mover caja no genera ajuste).
 */
export function planReleaseLegs(
  before: readonly CashEffect[],
  after: readonly CashEffect[],
  existingHolds: readonly AdjustmentLeg[],
  reopenedPeriods: ReadonlySet<string>,
  today: string
): AdjustmentLeg[] {
  const touched = periodsWithCashDelta(before, after, reopenedPeriods);
  if (touched.size === 0) return [];

  const groups = new Map<string, { template: AdjustmentLeg; totalCents: number }>();
  for (const hold of existingHolds) {
    if (hold.leg !== "hold" || !touched.has(hold.affectedPeriod)) continue;
    const key = legEffectKey(hold);
    const group = groups.get(key) ?? { template: hold, totalCents: 0 };
    groups.set(key, { template: group.template, totalCents: group.totalCents + hold.amountCents });
  }

  return [...groups.keys()].sort().flatMap((key): AdjustmentLeg[] => {
    const group = groups.get(key);
    if (!group || group.totalCents === 0) return [];
    const { template, totalCents } = group;
    const common = {
      affectedPeriod: template.affectedPeriod,
      direction: template.direction,
      paymentAccountId: template.paymentAccountId,
      businessUnitId: template.businessUnitId,
      quotationId: template.quotationId,
      purchaseOrderId: template.purchaseOrderId,
    };
    return [
      { ...common, leg: "hold", entryDate: template.entryDate, amountCents: -totalCents },
      { ...common, leg: "posting", entryDate: today, amountCents: totalCents },
    ];
  });
}
