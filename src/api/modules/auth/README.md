# Módulo: auth (sesión y contraseñas)

## Código de módulo (RBAC)
No tiene: son rutas públicas por diseño (se usan sin sesión). Son la única
excepción a `verifyAccess`, junto con `/signin`.

## Endpoints
| Método | Ruta                       | Acción                                        | Acceso |
|--------|----------------------------|-----------------------------------------------|--------|
| POST   | /signin                    | iniciar sesión                                | público |
| POST   | /signout                   | cerrar sesión                                 | con sesión |
| POST   | /password/forgot           | "¿Olvidaste tu contraseña?": manda un enlace  | público, máx. 20/h por IP |
| POST   | /password/link/check       | estado de un enlace (vigente, vencido, usado) | público, máx. 60/10 min por IP |
| POST   | /password/link/complete    | fija la contraseña con un enlace              | público, máx. 30/10 min por IP |

Las rutas viejas `/recovery/*` (código de 4 dígitos sin vencimiento ni límite
de intentos, que permitían tomar cualquier cuenta) se eliminaron en el
Sprint 2, junto con la columna `user.recovery_code`.

## Vistas de frontend vinculadas
- `/login` → "¿Olvidaste tu contraseña?"
- `/recuperar-contrasena` (pedir el enlace)
- `/restablecer-contrasena#token=…` (enlace de recuperación)
- `/activar-cuenta#token=…` (enlace de invitación de un usuario nuevo)

## Reglas de negocio propias del módulo
Pedido explícito del usuario: "yo no quiero códigos, quiero que llegue link para
crear contraseña o link para recuperarla que llegan al correo". Reglas de OWASP
(Forgot Password Cheat Sheet):

- **Dos tipos de enlace** (`password_reset_token.purpose`):
  - `invite` (72 h) para crear la contraseña, que se manda al crear un usuario o
    al reenviar la invitación;
  - `reset` (30 min) para recuperarla.
- **Token:**
  - 32 bytes aleatorios (`crypto.randomBytes`) en base64url;
  - en la base solo se guarda su SHA-256: quien lea la base no puede usar un
    enlace vigente;
  - sirve una sola vez, y pedir uno nuevo anula los anteriores del usuario.
- **El token va en el fragmento** (`#token=`), no como `?token=`: el navegador
  nunca lo manda al servidor, así que no queda en los logs de acceso ni sale en
  el Referer. La pantalla lo lee y lo envía por POST.
- **El enlace se arma con `APP_PUBLIC_URL`**, nunca con la cabecera Host (Host
  Header Injection). En producción, si falta, responde 503
  `APP_PUBLIC_URL_MISSING`; en desarrollo usa `http://localhost:4250`.
- **`/password/forgot` responde siempre lo mismo**, y al instante: el pedido se
  procesa después de responder. Así no revela qué correos están registrados ni
  por el tiempo de respuesta. Máximo 3 enlaces por cuenta y hora; si una cuenta
  está deshabilitada o su empresa también, no se manda nada.
- **Al canjear un enlace**, todo en una transacción con el enlace bloqueado
  (`SELECT … FOR UPDATE`, así no se usa dos veces):
  - fija la contraseña;
  - apaga `must_change_password`;
  - desbloquea la cuenta si estaba bloqueada por intentos fallidos;
  - cierra todas las sesiones;
  - deja usado este y cualquier otro enlace pendiente;
  - encola el aviso "Tu contraseña cambió".
  - No inicia sesión sola.
- **Política de contraseñas** (`core/validators/password.policy.ts`): entre 8 y
  128 caracteres, sin reglas de composición forzadas (NIST SP 800-63B) y sin las
  contraseñas más comunes. Al recuperar, no puede ser la misma de antes
  (`PASSWORD_REUSED`). Un enlace inválido, vencido o usado responde 400
  `PASSWORD_LINK_INVALID`.
- **Límite por IP en memoria** (`core/middlewares/rateLimit.ts`): un solo proceso
  en Hostinger. En desarrollo no se limita lo que viene de localhost, para que
  las pruebas automáticas puedan activar cientos de usuarios.

## Campos especiales
- `password_reset_token.used_at`: cuándo se usó o se anuló; `null` = vigente.
- Los correos salen por la cola del módulo [`email`](../email/README.md).
