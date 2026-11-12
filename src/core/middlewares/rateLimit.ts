import { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/AppError";
import { isProduction } from "../../config/runtime";

// Límite de intentos por ventana de tiempo, en memoria (sin librería nueva:
// express-rate-limit no está aprobado en CLAUDE.md). Alcanza porque en
// Hostinger corre un solo proceso; si el proceso se reinicia, los contadores
// vuelven a cero, lo que solo da algo más de margen y nunca bloquea de más.
//
// Se usa en los endpoints públicos (sin sesión): recuperar contraseña, canjear
// el enlace y ver una cotización compartida.
interface RateLimitOptions {
  // Nombre del límite: separa los contadores de cada endpoint.
  name: string;
  windowMs: number;
  max: number;
  // Por defecto, la IP real (detrás del proxy del hosting, ver trust proxy).
  keyOf?: (req: Request) => string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const SWEEP_EVERY = 500;
let callsSinceSweep = 0;

// Limpieza perezosa: cada N llamadas se borran los contadores vencidos, para
// que el mapa no crezca sin fin con IPs que no vuelven.
const sweep = (now: number) => {
  callsSinceSweep += 1;
  if (callsSinceSweep < SWEEP_EVERY) return;
  callsSinceSweep = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

/** Cuenta un intento; devuelve false si la clave ya superó el límite. */
export function consumeRateLimit(name: string, key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  sweep(now);
  const id = `${name}:${key}`;
  const bucket = buckets.get(id);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

// En desarrollo las pruebas automáticas llaman cientos de veces desde la misma
// máquina (ej. activan cada usuario de prueba con su enlace): ahí no se limita
// lo que viene de localhost. En producción el límite rige siempre: detrás del
// proxy del hosting, req.ip es la IP real del visitante, nunca localhost.
const isExempt = (req: Request): boolean => !isProduction() && LOOPBACK.has(req.ip ?? "");

export const rateLimit =
  ({ name, windowMs, max, keyOf }: RateLimitOptions) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (isExempt(req)) return next();
    const key = keyOf ? keyOf(req) : req.ip ?? "unknown";
    if (consumeRateLimit(name, key, windowMs, max)) return next();
    return next(new AppError(429, "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.", undefined, "RATE_LIMITED"));
  };
