"use strict";

/**
 * Escritor ZIP mínimo (deflate + CRC32 de zlib, incluidos en Node), sin
 * dependencias nuevas.
 *
 * Existe porque el empaquetado se hace en Windows y se descomprime en el
 * Linux del hosting: el `Compress-Archive` de Windows PowerShell 5.1 guarda
 * las rutas con barra invertida ("dist\index.js"), y un unzip de Linux crea
 * un archivo con ese nombre literal en vez de la carpeta dist/ — la app no
 * arrancaría. Acá las rutas van siempre con "/" y con permisos Unix.
 *
 * Sin ZIP64: alcanza de sobra para el paquete de la app (< 4 GB, < 65535
 * archivos).
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const UNIX_FILE_MODE = 0o100644;
const VERSION_NEEDED = 20; // 2.0 — deflate
const VERSION_MADE_BY_UNIX = (3 << 8) | VERSION_NEEDED;
const FLAG_UTF8_NAMES = 0x0800;
const METHOD_DEFLATE = 8;

const toDosDateTime = (date) => {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
};

const listFiles = (rootDir) => {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  walk(rootDir);
  return files.sort();
};

// Comprime TODO el contenido de `sourceDir` (sin la carpeta en sí) en
// `zipPath`. Devuelve cuántos archivos incluyó.
function zipDirectory(sourceDir, zipPath) {
  const now = toDosDateTime(new Date());
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  const files = listFiles(sourceDir);
  for (const absolute of files) {
    const name = Buffer.from(path.relative(sourceDir, absolute).split(path.sep).join("/"), "utf8");
    const raw = fs.readFileSync(absolute);
    const compressed = zlib.deflateRawSync(raw, { level: 9 });
    const crc = zlib.crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAG_UTF8_NAMES, 6);
    local.writeUInt16LE(METHOD_DEFLATE, 8);
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSION_MADE_BY_UNIX, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(FLAG_UTF8_NAMES, 8);
    central.writeUInt16LE(METHOD_DEFLATE, 10);
    central.writeUInt16LE(now.time, 12);
    central.writeUInt16LE(now.day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE((UNIX_FILE_MODE << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  fs.writeFileSync(zipPath, Buffer.concat([...localParts, centralDirectory, end]));
  return files.length;
}

module.exports = { zipDirectory };
