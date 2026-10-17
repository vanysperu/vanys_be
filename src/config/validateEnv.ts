import { isProduction } from "./runtime";

// Longitud mínima de la clave con la que se firman los JWT. Una clave corta
// o adivinable permite falsificar tokens de cualquier usuario — incluido el
// Super Administrador.
const MIN_JWT_SECRET_LENGTH = 32;

const REQUIRED_IN_PRODUCTION = ["PROY_BD", "PROY_BD_HOST", "PROY_BD_USER", "PROY_BD_PASS", "SECRET_HIDDEN_KEY"] as const;

// En producción la app se NIEGA a arrancar con una configuración incompleta.
// Antes arrancaba igual: sin SECRET_HIDDEN_KEY, jwt.sign recibía `undefined`
// y el login fallaba recién al primer intento, con un error genérico; sin
// datos de base, caía en la primera consulta. Fallar al iniciar, con la
// lista exacta de lo que falta, es lo que permite diagnosticarlo desde el
// panel del hosting sin tener que adivinar.
export function assertProductionEnv(): void {
  if (!isProduction()) return;

  const problems: string[] = [];

  for (const key of REQUIRED_IN_PRODUCTION) {
    if (!process.env[key]?.trim()) problems.push(`Falta la variable ${key}`);
  }

  const secret = process.env.SECRET_HIDDEN_KEY ?? "";
  if (secret && secret.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(`SECRET_HIDDEN_KEY debe tener al menos ${MIN_JWT_SECRET_LENGTH} caracteres (tiene ${secret.length})`);
  }

  if (problems.length === 0) return;

  throw new Error(
    `Configuración de producción incompleta — la app no arranca hasta corregirlo:\n  - ${problems.join("\n  - ")}`
  );
}
