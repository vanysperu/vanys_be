/**
 * Redondea un importe a 2 decimales (la precisión real de las columnas
 * DECIMAL(10,2) de la base de datos).
 *
 * Sin esto, un cálculo como 19.99 * 3 devuelve 59.97000000000001 en punto
 * flotante: MySQL lo guarda bien (59.97), pero el objeto que el service
 * devuelve al controller conserva el valor sucio, así que la respuesta
 * inmediata de "crear" mostraba decimales basura que desaparecían al
 * recargar. Se redondea en el service para que lo guardado y lo devuelto
 * sean siempre el mismo número.
 *
 * El +Number.EPSILON corrige el caso clásico de Math.round con binario
 * (2.675 -> 2.67 en vez de 2.68).
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
