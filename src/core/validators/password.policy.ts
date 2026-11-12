// Política de contraseñas (plan del Sprint 2, sección 5.5, criterio NIST
// SP 800-63B): entre 8 y 128 caracteres, sin reglas de composición forzadas, y
// rechazando las contraseñas más comunes. La misma regla en todas las
// pantallas donde se elige una contraseña (crear, recuperar, cambiar).
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// Las más usadas (listas públicas de filtraciones) y variantes locales. Se
// comparan en minúsculas y sin espacios.
const COMMON_PASSWORDS = new Set([
  "12345678", "123456789", "1234567890", "12345678910", "87654321", "11111111", "00000000", "12341234",
  "123123123", "11223344", "1q2w3e4r", "1qaz2wsx", "qwertyui", "qwerty123", "qwertyuiop", "asdfghjk",
  "password", "password1", "password123", "passw0rd", "contraseña", "contrasena", "contraseña1",
  "contrasena1", "iloveyou", "teamo123", "abcd1234", "abc12345", "admin123", "administrador", "welcome1",
  "bienvenido", "sunshine", "princesa", "superman", "football", "baseball", "trustno1", "letmein1",
  "peru1234", "lima1234", "vanys123", "grulla123", "123456ab", "a1234567", "aa123456", "q1w2e3r4",
]);

/** Devuelve el motivo si la contraseña no cumple la política, o null si está bien. */
export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `La contraseña debe tener como mínimo ${PASSWORD_MIN_LENGTH} caracteres`;
  if (password.length > PASSWORD_MAX_LENGTH) return `La contraseña debe tener como máximo ${PASSWORD_MAX_LENGTH} caracteres`;
  if (COMMON_PASSWORDS.has(password.toLowerCase().replace(/\s+/g, ""))) {
    return "Esa contraseña es demasiado común: elige otra más difícil de adivinar";
  }
  return null;
}
