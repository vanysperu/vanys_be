"use strict";

/**
 * Ordena las tablas del .sql de producción según sus claves foráneas, para
 * que cada tabla se cree DESPUÉS de las tablas a las que apunta.
 *
 * Por qué: el .sql desactiva la revisión de foráneas al inicio
 * (SET FOREIGN_KEY_CHECKS = 0), pero phpMyAdmin tiene su propia opción de
 * import "Habilitar la revisión de claves foráneas" que puede volver a
 * activarla. Con las tablas en orden alfabético, `cash_movement` se creaba
 * antes que `company`/`business_unit` y MariaDB rechazaba la tabla (pasó en
 * el primer despliegue en Hostinger). En el orden correcto, el import
 * funciona con la revisión activada o desactivada.
 *
 * Si dos tablas se apuntan entre sí (ciclo), no existe un orden válido: la
 * foránea que cierra el ciclo se saca del CREATE TABLE y se agrega al final
 * con ALTER TABLE, cuando todas las tablas (y sus datos) ya existen.
 */

// Línea de restricción foránea tal como la escribe SHOW CREATE TABLE:
//   CONSTRAINT `fk_x` FOREIGN KEY (`col`) REFERENCES `tabla` (`id`) ...
const FOREIGN_KEY_LINE = /^\s*CONSTRAINT `[^`]+` FOREIGN KEY .*REFERENCES `([^`]+)`/;

const referencedTable = (line) => FOREIGN_KEY_LINE.exec(line)?.[1] ?? null;

// Quita del CREATE TABLE las líneas indicadas y arregla la coma de la última
// línea que queda antes del ") ENGINE=...".
const removeLines = (ddl, linesToRemove) => {
  const kept = ddl.split("\n").filter((line) => !linesToRemove.includes(line));
  const closingIndex = kept.findIndex((line) => line.startsWith(")"));
  const lastDefinition = closingIndex - 1;
  if (lastDefinition >= 0) kept[lastDefinition] = kept[lastDefinition].replace(/,\s*$/, "");
  return kept.join("\n");
};

/**
 * @param {{ name: string, ddl: string }[]} tables  CREATE TABLE sin ";" final.
 * @returns {{ ordered: { name: string, ddl: string }[], deferredConstraints: string[] }}
 */
function orderTablesByForeignKeys(tables) {
  const byName = new Map(tables.map((table) => [table.name.toLowerCase(), table]));
  // Dependencias de cada tabla: a qué OTRAS tablas del dump apunta (una
  // foránea a sí misma, ej. resources.parent_id, no bloquea el orden).
  const dependencies = new Map(
    tables.map((table) => {
      const targets = table.ddl
        .split("\n")
        .map(referencedTable)
        .filter((target) => target && target.toLowerCase() !== table.name.toLowerCase() && byName.has(target.toLowerCase()))
        .map((target) => target.toLowerCase());
      return [table.name.toLowerCase(), new Set(targets)];
    })
  );

  const created = new Set();
  const ordered = [];
  const deferredConstraints = [];
  // Orden alfabético como desempate: el resultado es estable entre builds.
  const pending = [...byName.keys()].sort();

  while (pending.length > 0) {
    const readyIndex = pending.findIndex((name) => [...dependencies.get(name)].every((dep) => created.has(dep)));

    if (readyIndex >= 0) {
      const [name] = pending.splice(readyIndex, 1);
      ordered.push(byName.get(name));
      created.add(name);
      continue;
    }

    // Ciclo: la primera tabla pendiente se crea sin las foráneas que apuntan
    // a tablas todavía no creadas; esas foráneas van al final como ALTER.
    const [name] = pending.splice(0, 1);
    const table = byName.get(name);
    const blockingLines = table.ddl.split("\n").filter((line) => {
      const target = referencedTable(line);
      return target && target.toLowerCase() !== name && !created.has(target.toLowerCase());
    });
    blockingLines.forEach((line) =>
      deferredConstraints.push(`ALTER TABLE \`${table.name}\` ADD ${line.trim().replace(/,\s*$/, "")};`)
    );
    ordered.push({ ...table, ddl: removeLines(table.ddl, blockingLines) });
    created.add(name);
  }

  return { ordered, deferredConstraints };
}

module.exports = { orderTablesByForeignKeys };
