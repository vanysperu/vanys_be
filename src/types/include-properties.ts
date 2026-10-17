/**
 * Utilidad de tipo para incluir únicamente propiedades específicas de una interfaz o tipo base.
 * 
 * Este tipo toma una interfaz o tipo base `T` y una serie de claves `K` que se desea
 * incluir de `T`.
 *
 * Nota: Aunque se use la palabra "tipo" para referirse a `T`,
 * esto es aplicable tanto para alias de tipos como para interfaces.
 *
 * @template T La interfaz o tipo base del cual se quieren incluir propiedades.
 * @template K Las claves de las propiedades que se desean incluir de `T`.
 *
 * @example
 * interface ICar { wheels: number; color: string; electric: boolean; }
 * 
 * type IGasCar = IncludeProperties<ICar, 'wheels' | 'color'>
 * 
 * // Resultado de IGasCar: { wheels: number; color: string; }
 */
export type IncludeProperties<T, K extends keyof T> = Pick<T, K>;
