/**
 * Filtra un arreglo de objetos y regresa un arreglo de objetos únicos basado en la propiedad dada.
 * @template T
 * @param {T[]} arr - Arreglo de objetos para filtrar.
 * @param {keyof T} prop - Propiedad de los objetos a utilizar para la unicidad.
 * @param {Set<any>} [track = new Set()] - Conjunto para rastrear las propiedades únicas. Se inicializa como un conjunto vacío.
 * @returns {T[]} - Arreglo de objetos donde cada objeto tiene una propiedad única.
 */
function uniqueArrayObjectsUsingProp<T>(
  arr: T[],
  prop: keyof T,
  track: Set<T[keyof T]> = new Set()
): T[] {
  return arr.filter((obj) =>
    !track.has(obj[prop]) ? track.add(obj[prop]) : false
  );
}

/**
 * Crea un nuevo objeto seleccionando propiedades específicas del objeto proporcionado.
 *
 * @template T - El tipo del objeto fuente.
 * @template K - El tipo de las claves a seleccionar del objeto fuente.
 * 
 * @param {T} obj - El objeto fuente del cual se seleccionarán las propiedades.
 * @param {...K[]} keys - Un array de claves que indica qué propiedades seleccionar del objeto fuente.
 * 
 * @returns {Pick<T, K>} Un nuevo objeto que contiene solo las propiedades seleccionadas.
 * 
 * @example
 * const obj = { a: 1, b: 2, c: 3 };
 * const seleccionado = pick(obj, 'a', 'c'); // { a: 1, c: 3 }
 */
function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  return keys.reduce((o, k) => {
    if (obj?.hasOwnProperty(k)) {
      o[k] = obj[k];
    }
    return o;
  }, {} as Pick<T, K>);
}

/**
 * Aplana un objeto multidimensional.
 *
 * @example
 *   flattenObject({ a: 1, b: { c: 2 } })
 * Devuelve:
 *   { a: 1, c: 2}
 * 
 * @param obj - Objeto que puede tener propiedades anidadas
 * @returns Objeto con las propiedades aplanadas
 */
const flattenObject = (obj: Record<string, unknown>): Record<string, unknown> => {
  const flattened: Record<string, unknown> = {};

  Object.keys(obj).forEach((key) => {
    const value = obj[key];

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(flattened, flattenObject(value as Record<string, unknown>));
    } else {
      flattened[key] = value;
    }
  });

  return flattened;
}


function excludeElementsFromArray<T>(originalArray: T[], elementsToExclude: Set<T>): T[] {
  return originalArray.filter(element => !elementsToExclude.has(element));
}

function createDummyObject<T extends Record<string, unknown>>(): T {
  const baseObject: Record<string, unknown> = {};
  return new Proxy(baseObject, {
    get: (target, prop: string) => {
      return target[prop] || undefined;
    }
  }) as T;
}

function isValidString(str: string | null | undefined): boolean {
  return str !== null && str !== undefined && str.trim() !== "";
}

/**
 * Arma un árbol a partir de una lista plana, anidando cada item bajo su padre.
 * @param items Lista plana de items.
 * @param getId Devuelve el id de un item.
 * @param getParentId Devuelve el id del padre de un item (null/undefined = raíz).
 * @param childrenKey Nombre de la propiedad donde se guardan los hijos (default "children").
 */
function buildTree<T extends object>(
  items: T[],
  getId: (item: T) => number,
  getParentId: (item: T) => number | null | undefined,
  childrenKey: string = "children"
): T[] {
  const byParent = new Map<number | null, T[]>();

  items.forEach((item) => {
    const parentId = getParentId(item) ?? null;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId)!.push(item);
  });

  const attachChildren = (parentId: number | null): T[] => {
    const children = byParent.get(parentId) || [];
    return children.map((item) => ({
      ...item,
      [childrenKey]: attachChildren(getId(item)),
    }));
  };

  return attachChildren(null);
}

export {
  uniqueArrayObjectsUsingProp,
  pick,
  excludeElementsFromArray,
  createDummyObject,
  flattenObject,
  isValidString,
  buildTree,
};
