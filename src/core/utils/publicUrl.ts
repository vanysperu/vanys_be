import { isProduction } from "../../config/runtime";
import { AppError } from "../errors/AppError";

// Dirección pública de la app (la del frontend), para armar los enlaces que se
// mandan por correo o WhatsApp (contraseñas, cotizaciones compartidas). Sale de
// una variable de entorno y NUNCA de la cabecera Host de la petición: así nadie
// puede hacer que un enlace apunte a otro sitio (OWASP, Host Header Injection).
const DEV_PUBLIC_URL = "http://localhost:4250";

export function resolvePublicAppUrl(): string {
  const configured = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (!isProduction()) return DEV_PUBLIC_URL;
  throw new AppError(
    503,
    "Falta configurar APP_PUBLIC_URL en el servidor: no se pueden armar los enlaces",
    undefined,
    "APP_PUBLIC_URL_MISSING"
  );
}
