import { LoginStatus } from "./loginStatus";


const USER_DEFAULT_VALUES = Object.freeze({

    LOGIN_STATUS: LoginStatus.H,
    FAILED_ATTEMPTS: 0

  } as const);

// Contraseña temporal fija para usuarios creados desde el panel de admin.
// No se envía por correo (no hay envío de correo configurado todavía) — se
// obliga a cambiarla en el primer login vía must_change_password.
const DEFAULT_TEMPORARY_PASSWORD = "123456";

export {
    USER_DEFAULT_VALUES,
    DEFAULT_TEMPORARY_PASSWORD,
}


