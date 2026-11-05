import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { handleDriveCallbackService } from "../services/callback.service";

// Pantalla de Empresas del frontend. En producción el frontend lo sirve esta
// misma app (ruta relativa); en desarrollo vive en otro puerto (PROY_FEURL).
const COMPANIES_PATH = "/configuracion/apariencia-empresas";
const frontendBaseUrl = () => (process.env.PROY_FEURL ?? "").split(",")[0]?.trim().replace(/\/$/, "") ?? "";

// GET /google-drive/callback — Google vuelve acá después de que el Super
// Administrador da el permiso. Es una navegación del navegador (no un fetch),
// así que siempre responde redirigiendo a Empresas con el resultado.
export const driveCallbackController = asyncHandler(async (req: Request, res: Response) => {
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  const result = await handleDriveCallbackService({
    code: text(req.query.code),
    state: text(req.query.state),
    error: text(req.query.error),
  });

  const params = new URLSearchParams(
    result.ok
      ? { drive: "connected", companyId: String(result.companyId), email: result.email }
      : { drive: "error", reason: result.reason, ...(result.companyId ? { companyId: String(result.companyId) } : {}) }
  );
  res.redirect(`${frontendBaseUrl()}${COMPANIES_PATH}?${params.toString()}`);
});
