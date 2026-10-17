import { Response } from "express";

// Únicos helpers para construir respuestas exitosas/de error (CLAUDE.md
// sección 5) — ningún controller arma el `res.status().json()` a mano.
export function ok(res: Response, status: number, data: unknown, message?: string) {
  return res.status(status).json({ success: true, data, message });
}

export function fail(res: Response, status: number, message: string, errors?: unknown, code?: string) {
  return res.status(status).json({ success: false, message, errors, code });
}
