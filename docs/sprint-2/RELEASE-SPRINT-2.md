# Release del Sprint 2 — cómo subirlo a producción

> Versión **1.7.0** (backend) / **0.7.0** (frontend). Sale de la rama `feature/sprint-2`.
> Lo validado antes de subir está en la sección 6. Lo de SUNAT (emisión directa de la guía) **no**
> va en esta versión.

## 1. Qué trae

| Para el usuario | Detalle |
|---|---|
| Contraseñas por enlace | Usuario nuevo recibe un enlace para crear su contraseña (sin "123456"); "¿Olvidaste tu contraseña?" manda un enlace. Si el correo no está configurado, el admin copia el enlace y lo manda por WhatsApp. Se cerró el hueco de `/recovery/*` |
| Compartir la cotización | Enlace público por cotización (con interruptor), WhatsApp y correo con PDF |
| Productos no aceptados | En una cotización, un producto que el cliente no aceptó se marca "no aceptado": ustedes lo ven, el cliente no (PDF y enlace) y no suma al total. Se reactiva con un clic |
| Kanban de producción configurable | Columnas por empresa (Configuración → Flujo de producción), modo lineal o libre |
| Formularios iguales | Nuevo cliente/producto/técnica desde la cotización = mismos formularios de sus módulos |
| Proveedores | Catálogo de proveedores; el código de producto se elige por proveedor |
| Stock de proveedores* | Lee los Excel de stock de las importadoras (enlace o archivo) |
| Almacenes e inventario* | Almacenes por tienda, ingresos, salidas, transferencias, lotes, kardex; descuenta al entregar o al emitir la guía |
| Compras sin factura | "Sí, llega después", bandeja "Compras sin factura" en Facturas, una factura para varias compras; "Ingresar al almacén" al registrar una compra |
| Guía de remisión, modo manual* | Se arma en el sistema, se emite en SUNAT (SEE-SOL/App Emprender) y se registra aquí su número y PDF. Nada se envía a SUNAT |

\* Funcionalidades **por empresa**: nacen **apagadas**. Las prende el Super Administrador en
Empresas → Funcionalidades cuando la empresa las va a usar. La guía de remisión puede quedar apagada
hasta tener el RUC y la facturación listos.

Cambios de comportamiento para avisar al equipo:
- El Gestor ahora ve **Facturas** (solo lo de su tienda), para resolver sus compras sin factura.
- Las etapas de producción pasan de Variables Generales a **Configuración → Flujo de producción**
  (la migración copia las que había, por empresa).

## 2. Antes de subir (obligatorio)

1. **Respaldo de la base de producción**: hPanel → Bases de datos → phpMyAdmin → Exportar (rápido,
   SQL). Guardar el archivo. Es la vuelta atrás.
2. Anotar la versión actual (debería ser 1.6.1) y conservar el zip anterior.

## 3. Variables de entorno nuevas (hPanel → tu app Node.js → Variables de entorno)

Agregar (no reemplazar las que ya están):

| Variable | Valor | ¿Obligatoria? |
|---|---|---|
| `APP_PUBLIC_URL` | `https://<tu dominio>` | Sí: arma los enlaces de contraseña y de la cotización |
| `CRON_SECRET` | un texto largo al azar (si no existía) | Sí para el cron |
| `EMAIL_PROVIDER` | `brevo` (o vacío hasta tener la cuenta) | No: sin correo, el admin copia el enlace |
| `BREVO_API_KEY` | la clave de Brevo | Solo con Brevo |
| `EMAIL_FROM_ADDRESS` | `no-reply@<tu dominio>` (dominio verificado en Brevo) | Solo con Brevo |
| `EMAIL_FROM_NAME` | `Vanys` | No |
| `EMAIL_DAILY_LIMIT` | `300` (plan gratis de Brevo) | No |

**No cambiar** `SECRET_HIDDEN_KEY` ni `GOOGLE_DRIVE_TOKEN_KEY` (el `variables-entorno.env` que genera
`npm run release` trae unas nuevas al azar: ignóralas; solo copia las variables nuevas de arriba).
**No definir** `APP_ENCRYPTION_KEY`: se deriva de `SECRET_HIDDEN_KEY`.

## 4. Cron (hPanel → Avanzado → Cron jobs)

Cada 10 minutos:

```
curl -s -X POST -H "X-Cron-Secret: <CRON_SECRET>" https://<tu dominio>/api/internal/jobs/tick
```

Envía la cola de correos, vence cotizaciones, reintenta copias a Drive, actualiza el stock de
proveedores y avisa lotes por vencer. Reemplaza al cron anterior de `expire-quotations` (si se deja
también, no pasa nada: las tareas no se duplican).

## 5. Subir

1. En la PC, desde `grulla_be`: `npm run release -- --admin-email <correo>` → genera
   `deploy/salida/grulla-app.zip` (verifica build, arranque en modo producción y `/api/health`).
   **No** importar el `grulla_produccion.sql` que también genera: es solo para una instalación desde cero.
2. hPanel → tu app Node.js → subir `grulla-app.zip` y reiniciar.
3. Al arrancar, la app aplica **sola** las 10 migraciones y 10 seeders nuevos (ver lista abajo), con un
   candado para que no corran dos veces. Alternativa a mano desde la PC: `npm run db:upgrade-production`
   (primero sin `--aplicar` para ver lo pendiente).

Migraciones: `20261113100000` correo y enlaces · `20261113110000` enlace público · `20261113120000`
flujo de producción · `20261114100000` funcionalidades y proveedores · `20261114110000` stock de
proveedores · `20261114110100` códigos normalizados · `20261114120000` inventario · `20261115100000`
compras sin factura · `20261116100000` guías de remisión · `20261117100000` productos no aceptados.
Cada una tiene su vuelta atrás.

## 6. Validación hecha antes de este release

- Todas las pruebas del backend: 667 en verde. Pruebas de pantalla: 126 en verde; las 9 que fallan son
  por datos de la base de pruebas o pruebas que ya estaban desactualizadas antes del sprint (detalle en
  PROGRESO.md, sección "Release").
- **Ensayo de la actualización**: en una base temporal igual a producción antes del sprint, el build
  de producción arrancó y aplicó solo las 10 migraciones y 10 seeders; el resultado quedó idéntico a la
  base del sprint (columnas, índices, claves y permisos). La base temporal se borró.
- `npm run release` armó el paquete y lo probó arrancando en modo producción.

## 7. Después de subir: revisar

- `https://<dominio>/api/health` responde OK.
- Ingresar, abrir una cotización, ver su PDF y su enlace público.
- Configuración → Flujo de producción muestra las columnas de cada empresa.
- Facturas → pestaña "Compras sin factura".
- Crear un usuario de prueba: sale el enlace de invitación (copiar/WhatsApp).
- Empresas → Funcionalidades: las tres funcionalidades apagadas salvo que se prendan a propósito.

## 8. Si algo sale mal

Volver a subir el zip anterior y **restaurar el respaldo** del paso 2 (phpMyAdmin → Importar). No
intentar arreglar la base a mano a medias.
