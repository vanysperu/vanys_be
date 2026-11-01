// Dinero en céntimos enteros. Sumar o restar montos como números de punto
// flotante arrastra errores (0.1 + 0.2 = 0.30000000000000004): en un
// reparto de abonos eso bastaba para dejar una deuda "pendiente" por
// 0.00000001 o rechazar un pago exacto. Todo cálculo que compara o reparte
// montos se hace en céntimos y se vuelve a soles recién al guardar/mostrar.
export const toCents = (amount: number | string): number => Math.round(Number(amount) * 100);

export const fromCents = (cents: number): number => cents / 100;

export const formatSoles = (amount: number | string): string => `S/ ${Number(amount).toFixed(2)}`;
