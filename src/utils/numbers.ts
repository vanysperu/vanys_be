/**
 * Redondea un importe a 2 decimales (la precisión real de las columnas
 * DECIMAL(10,2) de la base de datos), con medio céntimo hacia arriba, como
 * se redondea a mano y como redondea SUNAT el IGV.
 *
 * Sin esto, un cálculo como 19.99 * 3 devuelve 59.97000000000001 en punto
 * flotante: MySQL lo guarda bien (59.97), pero el objeto que el service
 * devuelve al controller conserva el valor sucio, así que la respuesta
 * inmediata de "crear" mostraba decimales basura que desaparecían al
 * recargar. Se redondea en el service para que lo guardado y lo devuelto
 * sean siempre el mismo número.
 *
 * El medio céntimo exacto es el caso delicado: 374.25 × 1.18 es 441.615,
 * pero en binario llega como 441.61499999999995 y Math.round lo bajaba a
 * 441.61 (el +Number.EPSILON que se usaba antes solo alcanza para números
 * menores a 2). Por eso primero se limpia ese ruido con 15 cifras
 * significativas, y la coma se corre como TEXTO ("e2"): multiplicar por 100
 * vuelve a meter el ruido (1.005 × 100 = 100.49999999999999).
 *
 * Espejo exacto en el frontend: grulla_fe modules/quotations/utils/quotationAmounts.ts.
 */
export function roundMoney(value: number): number {
  const digits = Math.abs(value).toPrecision(15);
  // Notación exponencial: ruido de una resta (ej. 5.55e-17) o un número
  // fuera de rango; ahí no hay medio céntimo que cuidar.
  if (digits.includes("e")) return Math.round(value * 100) / 100;

  const cents = Math.round(Number(`${digits}e2`));
  return Math.sign(value) * Number(`${cents}e-2`);
}

/**
 * Devuelve un número aleatorio entre min (inclusive) y max (exclusivo).
 * @param {number} min - El valor mínimo (inclusive).
 * @param {number} max - El valor máximo (exclusivo).
 * @returns {number} Un número aleatorio entre min y max.
 */
export function getRandomArbitrary(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Devuelve un entero aleatorio entre min (inclusive) y max (inclusive).
 * El valor no es menor que min (o el siguiente entero mayor que min
 * si min no es un entero) y no es mayor que max (o el siguiente entero
 * menor que max si max no es un entero).
 * ¡Usar Math.round() te dará una distribución no uniforme!
 * @param {number} min - El valor mínimo (inclusive).
 * @param {number} max - El valor máximo (inclusive).
 * @returns {number} Un entero aleatorio entre min y max.
 */
export function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
