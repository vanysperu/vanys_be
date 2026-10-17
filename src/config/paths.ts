import fs from "fs";
import path from "path";

// Sube desde `startDir` hasta encontrar el package.json del backend. Sirve
// igual corriendo con ts-node (src/...) que compilado (dist/...), y NO
// depende de process.cwd(): en el hosting el proceso puede arrancar desde
// otra carpeta, y antes las fuentes del PDF y la carpeta de subidas se
// resolvían contra cwd — si no coincidía, el PDF se rompía sin aviso.
// Tope de niveles explícito: nunca un loop abierto (CLAUDE.md sección 8).
const MAX_LEVELS_UP = 8;

const findProjectRoot = (startDir: string): string => {
  let dir = startDir;
  for (let level = 0; level < MAX_LEVELS_UP; level++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
};

export const PROJECT_ROOT = findProjectRoot(__dirname);

// Fuentes TTF del PDF (Roboto, con tildes/ñ) — viven fuera de src/ porque
// tsc no copia archivos que no son .ts.
export const ASSETS_DIR = path.join(PROJECT_ROOT, "assets");

// Carpeta de archivos subidos (logos, QR de pago). En producción conviene
// apuntarla con UPLOADS_DIR a una ruta FUERA de la carpeta de la app: si el
// hosting reemplaza la carpeta de la app en cada despliegue, todo lo que
// los usuarios subieron se perdería.
export const resolveUploadsDir = (): string => {
  const configured = process.env.UPLOADS_DIR?.trim();
  if (configured) return path.resolve(configured);
  return path.join(PROJECT_ROOT, "uploads");
};
