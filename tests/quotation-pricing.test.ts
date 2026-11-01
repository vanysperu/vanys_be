import { roundMoney } from "../src/utils/numbers";
import { computeQuotationIgv, computeQuotationTotal } from "../src/api/modules/quotation/model/quotation.model";
import { allocateIgvByLine } from "../src/api/modules/quotation/services/shared/igv_breakdown";

// Pruebas puras (sin servidor): el cálculo de precios que comparten el
// guardado de la cotización, el PDF y las pantallas.

const IGV_RATE = 0.18;
const cents = (amount: number) => Math.round(amount * 100);

describe("roundMoney: medio céntimo hacia arriba, sin ruido binario", () => {
  it("redondea bien el medio céntimo exacto que el binario deja por debajo", () => {
    // 374.25 × 1.18 = 441.615 exacto, pero JS lo calcula como 441.61499999999995.
    expect(374.25 * 1.18).toBeLessThan(441.615);
    expect(roundMoney(374.25 * 1.18)).toBe(441.62);
    expect(roundMoney(374.25 * IGV_RATE)).toBe(67.37);
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(12.345)).toBe(12.35);
  });

  it("limpia los decimales basura sin cambiar el monto", () => {
    expect(roundMoney(19.99 * 3)).toBe(59.97);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(0.1 + 0.2 - 0.3)).toBe(0);
    expect(roundMoney(0)).toBe(0);
    expect(roundMoney(99999999.99)).toBe(99999999.99);
  });
});

describe("IGV y total de la cotización", () => {
  it("ejemplo del usuario: jabón ciento 0.90 + serigrafía ciento 0.95, 10 unidades", () => {
    const subtotal = roundMoney(roundMoney(0.9 + 0.95) * 10);
    expect(subtotal).toBe(18.5);
    expect(computeQuotationIgv(subtotal, true, IGV_RATE)).toBe(3.33);
    expect(computeQuotationTotal(subtotal, true, IGV_RATE)).toBe(21.83);
    expect(computeQuotationTotal(subtotal, false, IGV_RATE)).toBe(18.5);
  });

  it("el IGV con medio céntimo sube, como lo redondea SUNAT (antes guardaba 441.61)", () => {
    expect(computeQuotationIgv(374.25, true, IGV_RATE)).toBe(67.37);
    expect(computeQuotationTotal(374.25, true, IGV_RATE)).toBe(441.62);
  });

  it("total = subtotal + IGV, siempre con 2 decimales", () => {
    for (let subtotalCents = 1; subtotalCents <= 200000; subtotalCents += 7) {
      const subtotal = subtotalCents / 100;
      const igv = computeQuotationIgv(subtotal, true, IGV_RATE);
      const total = computeQuotationTotal(subtotal, true, IGV_RATE);
      // IGV exacto en céntimos enteros, medio céntimo hacia arriba.
      expect(cents(igv)).toBe(Math.floor((subtotalCents * 18 + 50) / 100));
      expect(cents(total)).toBe(subtotalCents + cents(igv));
    }
  });
});

describe("IGV por producto (PDF y pantallas)", () => {
  const sum = (values: number[]) => values.reduce((total, value) => total + cents(value), 0);

  it("las filas suman exactamente el resumen (caso real que antes no cuadraba)", () => {
    // Antes: IGV por fila 17.48 + 2.34 + 120.53 + 140.40 = 280.75, pero el
    // resumen decía 280.74; los totales por fila sumaban 1840.43 vs 1840.42.
    const lines = [{ subtotal: "97.10" }, { subtotal: "12.98" }, { subtotal: "669.60" }, { subtotal: "780.00" }];
    const rows = allocateIgvByLine(lines, 280.74).map(({ amounts }) => amounts);

    expect(sum(rows.map((row) => row.igv))).toBe(28074);
    expect(sum(rows.map((row) => row.total))).toBe(184042);
    rows.forEach((row) => expect(cents(row.total)).toBe(cents(row.subtotal) + cents(row.igv)));
  });

  it("cada fila cuadra: subtotal + IGV = total (antes 645.75 + 116.23 mostraba 761.99)", () => {
    const rows = allocateIgvByLine([{ subtotal: 645.75 }, { subtotal: 51400 }, { subtotal: 648.25 }], 9484.92).map(
      ({ amounts }) => amounts
    );
    rows.forEach((row) => expect(cents(row.total)).toBe(cents(row.subtotal) + cents(row.igv)));
    expect(sum(rows.map((row) => row.igv))).toBe(948492);
  });

  it("una sola línea se lleva todo el IGV; sin IGV, todo en cero", () => {
    expect(allocateIgvByLine([{ subtotal: 374.25 }], 67.37)[0]?.amounts).toEqual({
      subtotal: 374.25,
      igv: 67.37,
      total: 441.62,
    });
    expect(allocateIgvByLine([{ subtotal: 10 }, { subtotal: 5 }], 0).map(({ amounts }) => amounts.igv)).toEqual([0, 0]);
  });

  it("devuelve cada línea original junto a sus montos, en el mismo orden", () => {
    const lines = [{ id: 7, subtotal: 10 }, { id: 3, subtotal: 20 }];
    expect(allocateIgvByLine(lines, 5.4).map(({ line }) => line.id)).toEqual([7, 3]);
  });

  it("invariantes con miles de cotizaciones al azar", () => {
    let seed = 20261031;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

    for (let run = 0; run < 3000; run++) {
      const lines = Array.from({ length: 1 + Math.floor(random() * 6) }, () => ({
        subtotal: Math.round(random() * 500000) / 100,
      }));
      const subtotal = roundMoney(lines.reduce((total, line) => total + line.subtotal, 0));
      const igv = computeQuotationIgv(subtotal, true, IGV_RATE);
      const rows = allocateIgvByLine(lines, igv).map(({ amounts }) => amounts);

      expect(sum(rows.map((row) => row.igv))).toBe(cents(igv));
      expect(sum(rows.map((row) => row.total))).toBe(cents(computeQuotationTotal(subtotal, true, IGV_RATE)));
      rows.forEach((row, index) => {
        expect(cents(row.total)).toBe(cents(row.subtotal) + cents(row.igv));
        // Nunca se aleja más de un céntimo de su parte proporcional.
        const share = subtotal > 0 ? ((lines[index]?.subtotal ?? 0) / subtotal) * igv : 0;
        expect(Math.abs(row.igv - share)).toBeLessThan(0.0101);
      });
    }
  });
});
