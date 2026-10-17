/**
 * Utilidad de tipo para ignorar propiedades específicas de una interfaz o tipo base.
 * 
 * Este tipo toma una interfaz o tipo base `T` y una serie de claves `K` que se desea
 * omitir de `T`.
 *
 * Nota: Aunque se use la palabra "tipo" para referirse a `T`,
 * esto es aplicable tanto para alias de tipos como para interfaces.
 *
 * @template T La interfaz o tipo base del cual se quieren omitir propiedades.
 * @template K Las claves de las propiedades que se desean omitir de `T`.
 *
 * @example
 * interface ICar { wheels: number; color: string; electric: boolean; }
 * 
 * type IGasCar = IgnoreProperties<ICar, 'electric'>
 * 
 * // Resultado de IGasCar: { wheels: number; color: string; }
 */
export type IgnoreProperties<T, K extends keyof T> = Omit<T, K>;
