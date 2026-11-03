import {
  netEffectCents,
  planAdjustmentLegs,
  planReleaseLegs,
} from "../src/api/modules/cash_closing/services/shared/adjustment_legs";
import { AdjustmentLeg, CashEffect } from "../src/api/modules/cash_closing/types/cash_closing.types";

/**
 * Prueba PURA de planAdjustmentLegs (sin servidor ni base): las patas de
 * ajuste que genera corregir/anular/restaurar una fila de un mes cerrado.
 * Escenario del plan §3.5: marzo 2026 cerrado, hoy 12/05/2026.
 */
const CLOSED = new Set(["2026-03", "2026-04"]);
const TODAY = "2026-05-12";
const BCP = 11;
const YAPE = 12;
const STORE_A = 1;
const STORE_B = 2;

const effect = (overrides: Partial<CashEffect> = {}): CashEffect => ({
  date: "2026-03-10",
  direction: "income",
  amountCents: 10000,
  paymentAccountId: BCP,
  businessUnitId: STORE_A,
  quotationId: 45,
  purchaseOrderId: null,
  ...overrides,
});

// Invariante I3: por clave (cuenta/tienda/cotización/orden) hold + posting = 0.
const expectBalancedPerKey = (legs: AdjustmentLeg[]) => {
  const sums = new Map<string, number>();
  for (const leg of legs) {
    const key = [leg.direction, leg.paymentAccountId, leg.businessUnitId, leg.quotationId, leg.purchaseOrderId].join("|");
    sums.set(key, (sums.get(key) ?? 0) + leg.amountCents);
  }
  for (const total of sums.values()) expect(total).toBe(0);
};

// Efecto neto en el saldo de las patas de un tipo y una cuenta.
const netOf = (legs: AdjustmentLeg[], type: AdjustmentLeg["leg"], account: number | null) =>
  legs
    .filter((leg) => leg.leg === type && leg.paymentAccountId === account)
    .reduce((total, leg) => total + netEffectCents(leg.direction, leg.amountCents), 0);

describe("planAdjustmentLegs", () => {
  it("monto 100 → 80 en un mes cerrado: hold +20 en la fecha original, posting −20 hoy (ejemplo A)", () => {
    const legs = planAdjustmentLegs([effect()], [effect({ amountCents: 8000 })], CLOSED, TODAY);

    expect(legs).toEqual([
      expect.objectContaining({ leg: "hold", entryDate: "2026-03-10", amountCents: 2000, affectedPeriod: "2026-03" }),
      expect.objectContaining({ leg: "posting", entryDate: TODAY, amountCents: -2000, affectedPeriod: "2026-03" }),
    ]);
    expect(legs.every((leg) => leg.direction === "income" && leg.paymentAccountId === BCP)).toBe(true);
    expectBalancedPerKey(legs);
  });

  it("cambio de cuenta Yape → BCP: el mes cerrado queda igual por cuenta y el neto del posting es 0 (ejemplo B)", () => {
    const legs = planAdjustmentLegs([effect({ paymentAccountId: YAPE })], [effect()], CLOSED, TODAY);

    expect(legs).toHaveLength(4);
    expect(netOf(legs, "hold", YAPE)).toBe(10000);
    expect(netOf(legs, "hold", BCP)).toBe(-10000);
    expect(netOf(legs, "posting", YAPE)).toBe(-10000);
    expect(netOf(legs, "posting", BCP)).toBe(10000);
    expectBalancedPerKey(legs);
  });

  it("fecha sacada del mes cerrado a uno abierto: solo patas para el mes cerrado (ejemplo C)", () => {
    const legs = planAdjustmentLegs([effect({ date: "2026-03-31" })], [effect({ date: "2026-05-02" })], CLOSED, TODAY);

    expect(legs).toEqual([
      expect.objectContaining({ leg: "hold", entryDate: "2026-03-31", amountCents: 10000 }),
      expect.objectContaining({ leg: "posting", entryDate: TODAY, amountCents: -10000 }),
    ]);
    expectBalancedPerKey(legs);
  });

  it("anular un gasto de marzo: hold +50 (marzo sigue con su egreso), posting −50 de egreso (ejemplo D)", () => {
    const expense = effect({ date: "2026-03-20", direction: "expense", amountCents: 5000, paymentAccountId: null });
    const legs = planAdjustmentLegs([expense], [], CLOSED, TODAY);

    expect(legs).toEqual([
      expect.objectContaining({ leg: "hold", direction: "expense", entryDate: "2026-03-20", amountCents: 5000 }),
      expect.objectContaining({ leg: "posting", direction: "expense", entryDate: TODAY, amountCents: -5000 }),
    ]);
    // El saldo de Efectivo sube 50 en el mes abierto.
    expect(netOf(legs, "posting", null)).toBe(5000);
  });

  it("restaurar una fila de un mes cerrado: hold −monto, posting +monto", () => {
    const legs = planAdjustmentLegs([], [effect()], CLOSED, TODAY);

    expect(legs).toEqual([
      expect.objectContaining({ leg: "hold", amountCents: -10000 }),
      expect.objectContaining({ leg: "posting", amountCents: 10000 }),
    ]);
  });

  it("compra de trabajador pasada a pagada por la empresa: aparece el egreso solo como ajuste (ejemplo E)", () => {
    const purchase = effect({
      date: "2026-03-15",
      direction: "expense",
      amountCents: 12000,
      paymentAccountId: null,
      purchaseOrderId: 7,
    });
    const legs = planAdjustmentLegs([], [purchase], CLOSED, TODAY);

    expect(legs).toEqual([
      expect.objectContaining({ leg: "hold", entryDate: "2026-03-15", amountCents: -12000, purchaseOrderId: 7 }),
      expect.objectContaining({ leg: "posting", entryDate: TODAY, amountCents: 12000, purchaseOrderId: 7 }),
    ]);
    expect(netOf(legs, "posting", null)).toBe(-12000);
  });

  it("reposición repartida en dos tiendas bajada de monto: patas por tienda, solo donde cambió", () => {
    const allocation = (store: number, cents: number) =>
      effect({ direction: "expense", businessUnitId: store, amountCents: cents, quotationId: store * 100 });
    const legs = planAdjustmentLegs(
      [allocation(STORE_A, 6000), allocation(STORE_B, 4000)],
      [allocation(STORE_A, 6000), allocation(STORE_B, 1000)],
      CLOSED,
      TODAY
    );

    expect(legs).toHaveLength(2);
    expect(legs.every((leg) => leg.businessUnitId === STORE_B && leg.quotationId === 200)).toBe(true);
    expect(legs.map((leg) => leg.amountCents)).toEqual([3000, -3000]);
  });

  it("varias asignaciones con la misma clave se suman antes de comparar", () => {
    const legs = planAdjustmentLegs(
      [effect({ amountCents: 3000 }), effect({ amountCents: 7000 })],
      [effect({ amountCents: 10000 })],
      CLOSED,
      TODAY
    );
    expect(legs).toEqual([]);
  });

  it("cambio que no toca la clave (categoría, descripción, notas, cantidad): sin patas", () => {
    // Los efectos no llevan esos campos: antes y después son iguales.
    expect(planAdjustmentLegs([effect()], [effect()], CLOSED, TODAY)).toEqual([]);
  });

  it("solo re-vincular (otra tienda, cotización u orden, mismo monto y cuenta): sin patas", () => {
    const relinked = effect({ businessUnitId: STORE_B, quotationId: 99, purchaseOrderId: 3 });
    expect(planAdjustmentLegs([effect()], [relinked], CLOSED, TODAY)).toEqual([]);
  });

  it("re-vincular Y cambiar el monto: patas por clave, el neto del posting es la diferencia", () => {
    const legs = planAdjustmentLegs([effect()], [effect({ businessUnitId: STORE_B, amountCents: 8000 })], CLOSED, TODAY);

    expect(legs).toHaveLength(4);
    expect(netOf(legs, "hold", BCP)).toBe(2000);
    expect(netOf(legs, "posting", BCP)).toBe(-2000);
    expectBalancedPerKey(legs);
  });

  it("fila de un mes abierto, reabierto o anterior al libro: sin patas", () => {
    const openDate = effect({ date: "2026-05-03" });
    expect(planAdjustmentLegs([openDate], [{ ...openDate, amountCents: 1 }], CLOSED, TODAY)).toEqual([]);
    // Un mes reabierto no está en el conjunto de cerrados.
    const reopened = effect({ date: "2026-02-10" });
    expect(planAdjustmentLegs([reopened], [], CLOSED, TODAY)).toEqual([]);
    // Sin ningún mes cerrado (sin libro o todo abierto).
    expect(planAdjustmentLegs([effect()], [], new Set(), TODAY)).toEqual([]);
  });

  it("es determinista: el mismo cambio produce las mismas patas en el mismo orden", () => {
    const before = [effect({ paymentAccountId: YAPE }), effect({ businessUnitId: STORE_B })];
    const after = [effect()];
    const first = planAdjustmentLegs(before, after, CLOSED, TODAY);
    const second = planAdjustmentLegs([...before].reverse(), after, CLOSED, TODAY);
    expect(second).toEqual(first);
    expectBalancedPerKey(first);
  });
});

/**
 * planReleaseLegs (QA M1): una fila con holds en un mes REABIERTO que cambia
 * su caja ahí libera esas holds, para que el mes sume solo lo vivo al
 * re-cerrarlo y el posting original quede revertido en el mes abierto.
 * Escenario: octubre 2026 cerrado → ajustado en noviembre → reabierto; hoy 20/11.
 */
describe("planReleaseLegs", () => {
  const REOPENED = new Set(["2026-10"]);
  const RELEASE_TODAY = "2026-11-20";
  const october = (overrides: Partial<CashEffect> = {}): CashEffect => effect({ date: "2026-10-10", ...overrides });
  const hold = (amountCents: number, overrides: Partial<AdjustmentLeg> = {}): AdjustmentLeg => ({
    leg: "hold",
    affectedPeriod: "2026-10",
    entryDate: "2026-10-10",
    direction: "income",
    amountCents,
    paymentAccountId: BCP,
    businessUnitId: STORE_A,
    quotationId: 45,
    purchaseOrderId: null,
    ...overrides,
  });

  // Total de la fila en octubre: vivo + holds (viejas y nuevas), en céntimos con signo.
  const octoberTotal = (live: readonly CashEffect[], holds: readonly AdjustmentLeg[]) =>
    live.reduce((sum, item) => sum + netEffectCents(item.direction, item.amountCents), 0) +
    holds
      .filter((leg) => leg.leg === "hold" && leg.affectedPeriod === "2026-10")
      .reduce((sum, leg) => sum + netEffectCents(leg.direction, leg.amountCents), 0);

  it("pago anulado con octubre cerrado y restaurado con octubre reabierto: octubre = 100, ajustes netean 0", () => {
    // Anulado en noviembre con octubre cerrado: hold +100 oct, posting −100 nov.
    const annul = planAdjustmentLegs([october()], [], new Set(["2026-10"]), "2026-11-05");
    const existingHolds = annul.filter((leg) => leg.leg === "hold");
    expect(existingHolds.map((leg) => leg.amountCents)).toEqual([10000]);

    // Octubre reabierto: restaurar no genera patas de mes cerrado...
    expect(planAdjustmentLegs([], [october()], new Set(), RELEASE_TODAY)).toEqual([]);
    // ...pero sí libera la hold.
    const release = planReleaseLegs([], [october()], existingHolds, REOPENED, RELEASE_TODAY);
    expect(release).toEqual([
      expect.objectContaining({ leg: "hold", entryDate: "2026-10-10", amountCents: -10000, affectedPeriod: "2026-10" }),
      expect.objectContaining({ leg: "posting", entryDate: RELEASE_TODAY, amountCents: 10000, affectedPeriod: "2026-10" }),
    ]);
    expectBalancedPerKey(release);

    expect(octoberTotal([october()], [...existingHolds, ...release])).toBe(10000);
    const postings = [...annul, ...release].filter((leg) => leg.leg === "posting");
    expect(postings.reduce((sum, leg) => sum + netEffectCents(leg.direction, leg.amountCents), 0)).toBe(0);
  });

  it("corregido 100 → 80 con octubre cerrado y a 90 con octubre reabierto: octubre = 90", () => {
    const first = planAdjustmentLegs([october()], [october({ amountCents: 8000 })], new Set(["2026-10"]), "2026-11-05");
    const existingHolds = first.filter((leg) => leg.leg === "hold");

    const after = [october({ amountCents: 9000 })];
    const release = planReleaseLegs([october({ amountCents: 8000 })], after, existingHolds, REOPENED, RELEASE_TODAY);
    expect(release).toEqual([
      expect.objectContaining({ leg: "hold", amountCents: -2000 }),
      expect.objectContaining({ leg: "posting", entryDate: RELEASE_TODAY, amountCents: 2000 }),
    ]);
    expect(octoberTotal(after, [...existingHolds, ...release])).toBe(9000);
    // Los ajustes (posting −20 del 05/11 y +20 de hoy) netean 0: la verdad queda en octubre.
    expect(netOf([...first, ...release], "posting", BCP)).toBe(0);
  });

  it("sacar la fila del mes reabierto a uno abierto también libera las holds", () => {
    const existingHolds = [hold(2000)];
    const release = planReleaseLegs([october({ amountCents: 8000 })], [october({ date: "2026-11-02", amountCents: 8000 })], existingHolds, REOPENED, RELEASE_TODAY);
    expect(netOf(release, "hold", BCP)).toBe(-2000);
    expect(octoberTotal([], [...existingHolds, ...release])).toBe(0);
  });

  it("editar sin mover caja (descripción, notas) o solo re-vincular: las holds se quedan", () => {
    const existingHolds = [hold(2000)];
    expect(planReleaseLegs([october()], [october()], existingHolds, REOPENED, RELEASE_TODAY)).toEqual([]);
    expect(planReleaseLegs([october()], [october({ businessUnitId: STORE_B })], existingHolds, REOPENED, RELEASE_TODAY)).toEqual([]);
  });

  it("holds que ya netean 0, de otro mes o un mes que no está reabierto: sin patas", () => {
    expect(planReleaseLegs([october()], [], [hold(2000), hold(-2000)], REOPENED, RELEASE_TODAY)).toEqual([]);
    expect(planReleaseLegs([october()], [], [hold(2000, { affectedPeriod: "2026-09", entryDate: "2026-09-10" })], REOPENED, RELEASE_TODAY)).toEqual([]);
    expect(planReleaseLegs([october()], [], [hold(2000)], new Set(), RELEASE_TODAY)).toEqual([]);
  });

  it("holds de varias claves (cuentas): una liberación por clave, cada una balanceada", () => {
    // Cambio de cuenta Yape → BCP con octubre cerrado: hold +100 Yape, hold −100 BCP.
    const existingHolds = [hold(10000, { paymentAccountId: YAPE }), hold(-10000)];
    const release = planReleaseLegs([october()], [], existingHolds, REOPENED, RELEASE_TODAY);
    expect(release).toHaveLength(4);
    expect(netOf(release, "hold", YAPE)).toBe(-10000);
    expect(netOf(release, "hold", BCP)).toBe(10000);
    expectBalancedPerKey(release);
  });
});
