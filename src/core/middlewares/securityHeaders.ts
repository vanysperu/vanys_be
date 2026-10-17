import { NextFunction, Request, Response } from "express";

// Cabeceras de seguridad básicas, sin agregar una librería nueva (helmet no
// está aprobado en CLAUDE.md). Cubren lo esencial para producción:
// - nosniff: el navegador respeta el Content-Type declarado. Clave para las
//   imágenes subidas: aunque alguien suba HTML disfrazado de PNG, nunca se
//   ejecuta como página.
// - X-Frame-Options: nadie puede embeber la app en un iframe ajeno
//   (clickjacking).
// - Referrer-Policy: no filtra rutas internas (ids de cotizaciones) a
//   sitios externos.
// - HSTS solo cuando la petición ya llegó por HTTPS (detrás del proxy del
//   hosting, req.secure depende de `trust proxy`): obliga al navegador a
//   volver siempre por HTTPS. Sin `preload`, para no atarse para siempre.
const HSTS_MAX_AGE_SECONDS = 15552000; // 180 días

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (req.secure) {
    res.setHeader("Strict-Transport-Security", `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains`);
  }
  next();
}
