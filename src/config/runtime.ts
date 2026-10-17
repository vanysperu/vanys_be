import fs from "fs";
import path from "path";
import { CorsOptions } from "cors";
import { PROJECT_ROOT } from "./paths";

// Ajustes de ejecución que cambian entre desarrollo y producción, leídos de
// variables de entorno en UN solo lugar (antes estaban fijos en el código:
// CORS abierto a cualquier origen, body de 350 MB, trust proxy total).

export const isProduction = (): boolean => process.env.NODE_ENV === "production";

const DEFAULT_PORT = 4750;

// El hosting suele inyectar PORT (y es el puerto en el que su proxy espera
// encontrar la app); PROY_APP_PORT queda como alternativa para desarrollo.
export const resolvePort = (): number => {
  const raw = process.env.PORT ?? process.env.PROY_APP_PORT;
  const port = Number(raw);
  return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
};

// Lista de orígenes permitidos (separados por coma) — normalmente la URL
// pública del frontend. Si el frontend lo sirve esta misma app (mismo
// dominio), CORS ni siquiera interviene y la lista puede quedar vacía.
const parseOrigins = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

export const resolveCorsOptions = (): CorsOptions => {
  // En desarrollo se mantiene el comportamiento de siempre (cualquier
  // origen), para no romper Vite en otro puerto ni la suite E2E.
  if (!isProduction()) return { origin: true };

  const allowed = parseOrigins(process.env.CORS_ORIGINS ?? process.env.PROY_FEURL);
  return {
    origin: (origin, callback) => {
      // Sin cabecera Origin = misma app, curl, o el propio navegador pidiendo
      // un recurso del mismo dominio: no aplica CORS.
      if (!origin) return callback(null, true);
      return callback(null, allowed.includes(origin.replace(/\/+$/, "")));
    },
  };
};

// Cuántos proxies hay delante de la app. `true` (lo que había) confía en
// CUALQUIER X-Forwarded-For, así que cualquiera podía falsear la IP que
// queda en los logs. En un hosting compartido hay un único proxy delante.
export const resolveTrustProxy = (): number => {
  const hops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  return Number.isInteger(hops) && hops >= 0 ? hops : 1;
};

// Carpeta con el build del frontend (index.html + assets/) para servirlo
// desde esta misma app: un solo despliegue, un solo dominio, sin CORS.
// FRONTEND_DIST_DIR la fija explícitamente; si no, se usa ./public cuando
// trae un index.html. Devuelve null si no hay frontend que servir.
export const resolveFrontendDistDir = (): string | null => {
  const configured = process.env.FRONTEND_DIST_DIR?.trim();
  const candidate = configured ? path.resolve(PROJECT_ROOT, configured) : path.join(PROJECT_ROOT, "public");
  return fs.existsSync(path.join(candidate, "index.html")) ? candidate : null;
};
