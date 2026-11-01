// IGV por producto para el PDF y el detalle en pantalla (pedido explícito
// del usuario: ver cuánto se paga por cada producto y su IGV).
//
// El IGV real se cobra UNA vez sobre el subtotal de toda la cotización (ver
// computeQuotationIgv) y acá solo se reparte entre las líneas. Antes cada
// pantalla lo calculaba a su manera (el PDF ni siquiera redondeaba cada
// fila) y no cuadraba: en ~6% de las cotizaciones con varios productos la
// suma de los IGV por fila no daba el IGV del resumen, y a veces una misma
// fila mostraba Subtotal + IGV distinto de su Total.
//
// Reparto por mayor residuo, en céntimos enteros: cada línea recibe su parte
// proporcional truncada y los céntimos que faltan van a las líneas con mayor
// fracción. Así cada fila cuadra (subtotal + IGV = total), la suma de las
// filas es exactamente el resumen, y si el redondeo línea por línea ya
// cuadraba, el resultado es ese mismo.
//
// Espejo exacto en el frontend: grulla_fe modules/quotations/utils/quotationAmounts.ts.

export interface LineIgvAmounts {
  subtotal: number;
  igv: number;
  total: number;
}

const toCents = (amount: number | string): number => Math.round(Number(amount) * 100);

export const allocateIgvByLine = <T extends { subtotal: number | string }>(
  lines: T[],
  igvTotal: number
): Array<{ line: T; amounts: LineIgvAmounts }> => {
  const lineCents = lines.map((line) => toCents(line.subtotal));
  const baseCents = lineCents.reduce((sum, cents) => sum + cents, 0);
  const igvCents = baseCents > 0 ? Math.max(toCents(igvTotal), 0) : 0;

  // Parte entera y residuo con aritmética entera (exacta mientras el
  // producto no pase de 2^53: cotizaciones de hasta ~S/ 2 millones).
  const shares = lineCents.map((cents, index) => {
    const product = cents * igvCents;
    const remainder = baseCents > 0 ? product % baseCents : 0;
    return { index, floor: baseCents > 0 ? (product - remainder) / baseCents : 0, remainder };
  });

  const assigned = shares.reduce((sum, share) => sum + share.floor, 0);
  const extraCents = new Set(
    [...shares]
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
      .slice(0, Math.max(igvCents - assigned, 0))
      .map((share) => share.index)
  );

  return lines.map((line, index) => {
    const cents = lineCents[index] ?? 0;
    const lineIgvCents = (shares[index]?.floor ?? 0) + (extraCents.has(index) ? 1 : 0);
    return {
      line,
      amounts: { subtotal: cents / 100, igv: lineIgvCents / 100, total: (cents + lineIgvCents) / 100 },
    };
  });
};
