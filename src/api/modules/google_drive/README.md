# Módulo: google_drive (Drive de cada empresa)

Pedido explícito del usuario: cada empresa guarda una copia de sus facturas en
SU Google Drive (un Gmail por empresa), ordenada por carpetas, y el sistema
nunca borra nada allá. Lo configura SOLO el Super Administrador.

## Código de módulo (RBAC)
Los recursos cuelgan de `platform` (pantalla Empresas) y no se otorgan a ningún
rol: el Super Administrador los tiene implícitos y las rutas exigen
`requireSystemRole`. Seeder `20261107100100-seed-invoice-module.js`.

## Endpoints
| Método | Ruta                                   | Acción                                   | Protección |
|--------|----------------------------------------|------------------------------------------|------------|
| GET    | /api/google-drive/connect-url/:companyId | dirección de Google para conectar       | Super Admin (`google_drive.connect.button`) |
| GET    | /api/google-drive/status/:companyId    | Gmail conectado, espacio y último error  | Super Admin (`google_drive.status.endpoint`) |
| PUT    | /api/google-drive/disconnect/:companyId | desconectar (no borra nada en Drive)    | Super Admin (`google_drive.disconnect.button`) |
| GET    | /api/google-drive/callback             | vuelta de Google (sin sesión)            | `state` firmado |

## Configuración del servidor (una sola vez para todo el sistema)
Son las credenciales de la "app" Vanys en Google Cloud, NO el Drive de una
empresa (cada empresa conecta el suyo desde Empresas):
- `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`: cliente OAuth "Aplicación web".
- `GOOGLE_DRIVE_REDIRECT_URI`: `https://<dominio>/api/google-drive/callback`
  (debe estar en "URIs de redireccionamiento autorizados").
- `GOOGLE_DRIVE_TOKEN_KEY`: clave secreta para cifrar los permisos guardados y
  firmar la vuelta de Google. Si cambia, hay que volver a conectar los Drives.
Sin estas variables, Drive aparece como "no configurado" y las facturas solo
se guardan en el sistema.

## Vistas de frontend vinculadas
- Diálogo "Facturas" de cada empresa en `platform.company.theme.view`
  (`/configuracion/apariencia-empresas`).

## Reglas de negocio propias del módulo
- Permiso `drive.file`: el sistema solo ve y crea SUS archivos, nunca el resto
  del Drive de la empresa.
- El refresh token se guarda cifrado (AES-256-GCM). El `state` de la vuelta de
  Google va firmado (HMAC) y vence a los 10 minutos; además se verifica que
  quien conectó siga siendo Super Administrador.
- Al conectar se crea la carpeta "Facturas - <empresa>" y se copian las
  facturas que estaban pendientes. Si alguien borra esa carpeta en Drive, el
  sistema crea otra.
- Desconectar quita el permiso en Google y borra la conexión; los archivos de
  Drive se conservan.
- La app de Google debe estar **publicada** (pantalla de consentimiento "En
  producción"): en modo prueba el permiso vence a los 7 días.
