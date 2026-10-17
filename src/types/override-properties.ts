/**
 * Utilidad de tipo para sobrescribir propiedades de una interfaz o tipo base.
 *
 * Este tipo toma una interfaz o tipo base `T` y un tipo de sobrescritura `U`.
 * El tipo resultante tendrá propiedades de `T` a menos que
 * estén específicamente sobrescritas por propiedades en `U`.
 *
 * Nota: Aunque se use la palabra "tipo" para referirse a `T` y `U`,
 * esto es aplicable tanto para alias de tipos como para interfaces.
 *
 * @template T La interfaz o tipo base a sobrescribir.
 * @template U El tipo que contiene propiedades para sobrescribir las de `T`.
 *
 * @example
 * interface ICar { wheels: number; color: string; electric: boolean; }
 *
 * export interface IElectricCar extends OverrideProperties<
 *   ICar,
 *   {
 *     electric: true;
 *     batteryLife: number;
 *   }
 * > {}
 *
 * // Resultado de IElectricCar: { wheels: number; color: string; electric: true; batteryLife: number; }
 */
export type OverrideProperties<T, U> = U &
  Omit<T, keyof U>;
