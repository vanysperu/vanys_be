# Sprint 2 — Plan de trabajo (v0.2)

> **Fecha:** 12-nov-2026 · **Estado:** v0.2, con las decisiones D1–D16 cerradas (sección 11).
> Todavía no se implementó nada.
> **Alcance:** los 7 ítems del Sprint 2 (los 6 pedidos iniciales y compartir la cotización) y lo
> que encontré al revisar el código. Los módulos extra de la sección 10 no entran (D17).
> Este es el plan oficial del sprint: cualquier cambio de alcance se anota aquí.

---

## Resumen

| # | Pedido | Qué propongo | Tamaño | Depende de |
|---|---|---|---|---|
| — | Seguridad (hallazgo) | Reemplazar la recuperación de contraseña actual, que hoy permite tomar cualquier cuenta. Por decisión del usuario se hace dentro del ítem 4, al empezar el sprint | Incluido en el ítem 4 | — |
| 3 | Compras sin factura | Respuesta "la factura llega después", bandeja de compras sin factura y vincular varias compras a una factura sin pasar por "Corregir" | S | Proveedores (opcional) |
| 4 | Correo y contraseñas | Envío por API HTTPS (Brevo), cola de correos, enlace de recuperación e invitación al crear usuario | M | — |
| 7 | Compartir la cotización (nuevo) | Vista para el cliente sin login, con interruptor por cotización; envío por WhatsApp y por correo (enlace + PDF) | M | Ítem 4 (para el correo) |
| 8 | Fix: campos descuadrados en Nueva cotización (nuevo) | Alinear la fila por arriba, para que los mensajes de abajo no la desacomoden | XS | — |
| 9 | Mismos formularios de cliente y producto en Nueva cotización (nuevo, 13-nov) | Los diálogos "nuevo cliente" y "nuevo producto" de Nueva cotización usan el mismo formulario de los módulos Clientes y Productos | S | — |
| 5 | Kanban configurable | Columnas y flujo propios por empresa, modo lineal o libre, historial de movimientos | M | — |
| 6 | Stock de proveedores | Módulo `supplier_stock`: Excel por enlace, importación programada y stock por proveedor + total al cotizar | M–L | Proveedores, librería de Excel, archivos de ejemplo |
| 2 | Almacenes | Módulo `inventory`: almacenes por tienda, entradas, salidas, transferencias, kardex, lotes, vencimientos y stock negativo configurable | XL | Funcionalidades por empresa, variantes por color |
| 1 | Guía de remisión | Módulo `dispatch_guide`: GRE remitente electrónica directo a SUNAT (D1), con modo manual de respaldo | L–XL | Ubigeo, series, prueba técnica con SUNAT |

**Orden acordado:** entorno → base común → 4 (contraseñas; cierra el riesgo de seguridad) → 7 y 8
(compartir la cotización y fix del formulario) → 5 → 9 (formularios de cliente y producto) → 6 → 2 →
3 (compras sin factura) → 1. Todo lo de SUNAT (la prueba técnica y la GRE) va al final, por decisión del usuario:
hay que hacerlo con cuidado para no caer en multas. El detalle está en la sección 13.

---

## 1. Urgente: la recuperación de contraseña actual permite tomar cualquier cuenta

> **Decisión del usuario (12-nov-2026):** no se hace un hotfix aparte. Se resuelve al empezar el
> sprint, en el ítem 4, con enlaces por correo y sin códigos. Hasta entonces el riesgo sigue
> abierto en producción, por eso el ítem 4 es el primer bloque de trabajo.

Esto está en producción hoy:

- `POST /api/recovery/send-code`, `/api/recovery/verify-code` y `/api/recovery/user-account`
  están publicadas sin sesión ([auth.route.ts](../../grulla_be/src/api/modules/auth/routes/auth.route.ts),
  montadas en [index.server.ts:111](../../grulla_be/src/server/index.server.ts#L111)).
  Ninguna pantalla del frontend las usa.
- `send-code` guarda un código de 4 dígitos (`getRandomInt(1001, 9999)` con `Math.random`,
  [auth.controller.ts:147](../../grulla_be/src/api/modules/auth/controllers/auth.controller.ts#L147))
  y responde "¡Código enviado a tu correo!" **sin enviar nada**.
- El código no vence y no hay límite de intentos ni de velocidad.
- `recovery/user-account` recibe el correo, el código y la contraseña nueva, cambia la contraseña y
  además desbloquea la cuenta.
- **Resultado:** quien conozca el correo de un usuario puede cambiarle la contraseña con, como
  máximo, unas 9 000 peticiones. Eso incluye al Super Administrador.
- **Además:**
  - `send-code` responde 404 si el correo no existe, así que se puede averiguar qué correos están
    registrados.
  - El detalle de usuario (`findUserInformationById`) devuelve `recovery_code`.
  - Los usuarios nuevos nacen con la contraseña fija `123456`
    ([defaultValues.ts:14](../../grulla_be/src/api/modules/users/constants/defaultValues.ts#L14)).
    Quien conozca el correo de un usuario recién creado puede entrar antes que él y fijar su propia
    contraseña.

**Lo que hace el ítem 4 con esto:**

1. Quitar las 3 rutas `/recovery/*`. No rompe nada porque ninguna pantalla las usa.
2. Sacar `recovery_code` de las consultas que lo devuelven y eliminar la columna.
3. Reemplazar la contraseña fija `123456` por la invitación con enlace (D13).

El flujo nuevo, con enlaces por correo, está en la sección 5.

---

## 2. Cómo vamos a trabajar (rama + base aparte)

- **Ramas:** `feature/sprint-2` en `grulla_be` (desde v1.6.1) y en `grulla_fe` (desde v0.6.1).
- **Worktrees**, para no mover la copia de `main` que usan las otras sesiones y los hotfix:
  ```bash
  git -C grulla_be worktree add ../sprint2/grulla_be -b feature/sprint-2
  git -C grulla_fe worktree add ../sprint2/grulla_fe -b feature/sprint-2
  ```
  Quedan en `C:\Extensiones\vn\sprint2\`, dentro del límite del proyecto. Los `.env` no están en git:
  se copian y se ajustan.
- **Base:** `grulla_s2_dev`, copia de `grulla_dev` (`mysqldump` → `mysql`). Con el sufijo `_dev`
  funcionan `db:reset-factory` y `db:seed-qa`. No se usa una copia de producción (D15).
- **Puertos:** backend 4760 (`PROY_APP_PORT`); frontend 4260
  (`npm run dev -- --port 4260`, `VITE_API_URL=http://localhost:4760/api`). `main` sigue en
  4750/4250. Antes de arrancar se verifica quién ocupa cada puerto (CLAUDE.md §0).
- **Pruebas:** jest y Playwright del sprint corren contra su propia base y su propio puerto. Así no
  cierran la sesión del usuario en `grulla_dev` ni chocan con las pruebas de otras sesiones.
- **Migraciones:** todas idempotentes (`tableExists`/`columnExists`) y con fecha posterior a las de
  `main`. Al publicar, `npm run db:upgrade-production` aplica solo las pendientes. Antes del release
  se ensayan sobre una copia de producción.
- **Sincronizar:** cada hotfix que salga en `main` se integra en la rama.
- **Salir por partes (opcional, recomendado):** cada bloque terminado puede integrarse a `main` con
  su funcionalidad apagada por empresa. Así no se publica todo de golpe al final.
- **Secretos nuevos:** la clave para cifrar credenciales de SUNAT y enlaces de proveedores sigue la
  misma regla que `GOOGLE_DRIVE_TOKEN_KEY`. Producción conserva la primera clave y
  `npm run release` no debe cambiarla.
- **Convenciones de CLAUDE.md en todo módulo nuevo:**
  - un archivo por acción, README, recursos RBAC y menú;
  - auditoría, `company_id` y deshabilitar en lugar de borrar;
  - paginación y errores con `AppError`;
  - código en inglés.
  - La validación usa express-validator o joi: el backend no tiene zod.
  - Los filtros de Sequelize se arman con `WhereOptions[]` + `Op.and` (evita el problema de
    compilación ya conocido).

---

## 3. Base común (lo que necesitan varios ítems)

### 3.1 Funcionalidades por empresa (`company_feature`)
- Hoy cada interruptor es una columna de `company` (`product_images_enabled`, `invoice_storage_*`).
  Vienen al menos 3 más (almacén, stock de proveedores, guías) y después otras (portal, facturación).
- Propuesta:
  - Tabla `company_feature (company_id, feature_code, enabled, settings JSON, auditoría)`, única
    por `(company_id, feature_code)`.
  - Solo la cambia el Super Administrador, en Empresas.
  - `/access/me` devuelve `features: string[]`.
  - Middleware `requireCompanyFeature('inventory')`: si está apagada responde 403 `FEATURE_DISABLED`.
- **La funcionalidad dice si la empresa la tiene contratada; el rol sigue decidiendo qué usuario la
  usa** (RBAC sin cambios). Los interruptores actuales no se migran ahora.

### 3.2 Proveedores (`supplier`, módulo mínimo; D7 aprobado)
- Hoy no existen: el proveedor es texto libre en `product_code.supplier` y las compras no lo guardan.
- Lo necesitan las facturas de compra (3), las fuentes de stock (6), los ingresos de almacén (2) y
  los transportistas de la GRE (1).
- **Campos:**
  - `document_type`, `document_number` (RUC), `name`, `trade_name`;
  - `email`, `phone`, `address`;
  - `is_carrier` y `mtc_registration` (para transportistas);
  - `active` y auditoría.
- Es un catálogo estándar: crear, editar, listar y deshabilitar.
- **Migración:** se crea un proveedor por cada texto distinto de `product_code.supplier` en cada
  empresa y se enlaza `product_code.supplier_id`. El texto original se conserva.

### 3.3 Ubigeo y direcciones
- Catálogo `ubigeo` de INEI (unos 1 900 distritos), sembrado desde un archivo. En pantalla, selector
  Departamento → Provincia → Distrito.
- `business_unit` suma `ubigeo` y `sunat_establishment_code` (4 dígitos; `0000` = domicilio fiscal).
- `client_address`: varias direcciones de entrega por cliente, con ubigeo. La GRE las necesita como
  punto de llegada; hoy el cliente tiene una sola dirección en texto libre.

### 3.4 Series y numeración (`document_series`)
- Campos: `company_id`, `business_unit_id` (opcional), `document_type`, `series`, `next_number`.
- El número se toma con `SELECT … FOR UPDATE` dentro de la transacción: sin saltos ni duplicados.
- Sirve para la GRE (`T001`), los documentos de almacén (NI/NS/TR/AJ) y más adelante las facturas.

### 3.5 Tareas programadas en Hostinger
- La app se apaga sin visitas, así que un `setInterval` no alcanza.
- Un solo endpoint `POST /api/internal/jobs/tick`, con la cabecera `X-Cron-Secret` (mismo esquema
  que `expire-quotations`), corre lo que esté pendiente:
  - la cola de correos;
  - la importación de stock de proveedores;
  - la consulta de tickets SUNAT;
  - las alertas de stock y de vencimiento.
- Un cron de hPanel cada 10 minutos.

### 3.6 Secretos cifrados
- Se guardan cifrados en la base (mismo enfoque que el token de Drive): credenciales SOL,
  `client_secret`, certificado `.pfx` con su clave y enlaces de proveedores que traigan token.
- Nunca aparecen en logs ni en respuestas: en pantalla solo se ve "configurado".

### 3.7 Datos que le faltan al producto
- `tracks_stock` (maneja stock).
- `unit_code`: unidad SUNAT del catálogo 03, por defecto `NIU`.
- `unit_weight_kg`: para calcular el peso bruto de la GRE.
- `is_perishable`: pide fecha de vencimiento en los almacenes que la controlan.
- **Colores estables** (D2: el stock va por color): hoy guardar los colores borra y recrea la lista, así que
  sus ids cambian. Para llevar stock por color:
  - guardar debe actualizar cada color por su nombre;
  - un color con stock o movimientos no se borra, se deshabilita.

---

## 4. Ítem 3 — Compras sin factura (fix)

**Cómo funciona hoy:**
- Al registrar una compra, la pregunta "¿La compra tiene factura?" solo admite Sí o No
  ([InvoiceQuestion.tsx](../../grulla_fe/src/modules/invoices/components/InvoiceQuestion.tsx)).
- Con "Sí" se crea una factura nueva o la compra se suma a una ya registrada. Se ofrecen hasta 20
  facturas, solo de la misma empresa y la misma tienda
  ([purchase_candidates.service.ts](../../grulla_be/src/api/modules/invoice/services/purchase_candidates.service.ts)).
- Si la factura todavía no llegó, solo se puede responder "No".
- Después, la única forma de vincularla es **Corregir compra**:
  - exige motivo y es solo para administradores (el seeder excluye al Gestor);
  - queda registrada como corrección de dinero, aunque no se movió dinero.
- No existe una lista de compras sin factura. "Faltan subir" muestra facturas sin archivo, no
  compras sin factura. Es decir, eso **no lo tenemos todavía**.
- La factura no guarda serie, número, proveedor, fecha ni monto. Al elegir "una ya registrada" solo
  se ve fecha, cotización y descripción.

**Propuesta:**
1. **Tres respuestas:** "Sí, ya la tengo" / "Sí, llega después" / "No lleva factura".
   - Nueva columna en la compra: `invoice_status` = `linked` | `pending` | `not_required`.
   - Las compras existentes con factura pasan a `linked` y las demás a `not_required`.
2. **Bandeja "Compras sin factura"** en Facturas, como pestaña con contador:
   - muestra las compras `pending`;
   - un interruptor permite ver también las `not_required`;
   - filtros por proveedor, fecha, tienda y cotización, con selección múltiple.
3. **Registrar factura para varias compras:**
   - con las compras seleccionadas se crea UNA factura, o se suman a una existente;
   - el archivo se sube en el mismo paso;
   - todo en una sola transacción.
4. **"Vincular factura" en cada compra:**
   - está en el checklist de la orden, en Gastos y en la bandeja;
   - no pide motivo, porque no mueve dinero;
   - permiso nuevo `invoice.link.button`, para quien registra compras y para los administradores;
   - queda como evento en el historial de la cotización, no en `money_correction`.
5. **Desde la factura:** "Agregar compras" y "Quitar compra". Valen las reglas que ya existen para
   una factura que se queda sin compras.
6. **Datos de la factura** (D9: opcionales al inicio):
   - proveedor, serie-número (`F001-123`), fecha de emisión, moneda y total;
   - las facturas se buscan por número o por proveedor;
   - avisa si se repite proveedor + serie + número.
7. **Facturas de varias tiendas (D8):** un admin de la empresa puede juntar en una factura compras de
   varias tiendas. Un usuario ligado a una tienda solo junta las de su tienda. Las facturas
   candidatas y la bandeja respetan ese alcance.
8. **"Corregir compra" se mantiene** para monto, cantidad y origen de fondos. Ya no hace falta para
   vincular la factura.

**Terminado cuando:**
- Un Gestor registra 3 compras con "llega después". Al llegar la factura, las selecciona en la
  bandeja y crea una sola factura con archivo, sin motivo y sin pasar por Corregir.
- La bandeja respeta el alcance de tienda y empresa, y el contador baja al vincular.
- Las compras anuladas no aparecen y las pruebas cubren la transacción completa.

---

## 5. Ítem 4 — Correo y gestión de contraseñas

### 5.1 Envío de correo gratis (planes a noviembre de 2026)

| Proveedor | Gratis por mes | Por día | Notas |
|---|---|---|---|
| **Brevo** | ~9 000 | 300 | Permanente; la cuenta pasa por aprobación; API HTTP y SMTP |
| Mailjet | 6 000 | 200 | Permanente |
| Resend | 3 000 | 100 | Permanente; API muy simple; 3 dominios |
| SMTP2GO | 1 000 | 200 | 25 por hora hasta verificar el dominio |
| MailerSend | 500 | — | — |
| Postmark | 100 | — | — |
| SendGrid | — | — | Ya no tiene plan gratis (solo prueba de 60 días) |
| Correo de Hostinger | Incluido en el plan | No publicado | Solo SMTP y entrega menos confiable |

Los límites son de terceros: hay que confirmarlos al crear la cuenta.

**Decidido (D12): Brevo por su API HTTPS.** La cuenta se crea al empezar el sprint, porque la
aprobación de Brevo y la verificación del dominio pueden tardar.
- Se llama con `fetch`, sin librería nueva.
- Va detrás de una interfaz `EmailProvider`: cambiar a Resend o Mailjet es una variable de entorno.
- Tiene el mayor cupo diario gratis, y HTTPS evita los bloqueos de puertos SMTP comunes en hostings.

**Requisitos:**
- Un dominio propio para el remitente (ej. `no-reply@<dominio de Vanys>`).
- Registros SPF, DKIM y DMARC en el DNS de Hostinger.
- Los correos de una empresa salen del dominio de la plataforma, con `Reply-To` = correo de la
  empresa.

### 5.2 Cola de correos (`email_outbox`)
- **Campos:** `company_id` (opcional), destinatario, plantilla, `payload` cifrado (se borra al
  enviarse), `status` (pending/sent/failed), intentos, próximo intento, id del proveedor, último
  error y auditoría.
- Se envía apenas se confirma la transacción. Si falla, el job reintenta con espera creciente, hasta
  5 veces.
- Nunca se registran en logs direcciones completas ni enlaces.
- **Cupo diario** (pedido del usuario):
  - el sistema cuenta los correos enviados en el día contra el límite del plan
    (`EMAIL_DAILY_LIMIT`: 300 en el plan gratis de Brevo, compartido por todas las empresas);
  - si Brevo rechaza un envío por límite, también cuenta como agotado;
  - al llegar al 80 % y al agotarse, cada Super Administrador recibe una notificación en la campana
    (no por correo, porque ya no quedaría cupo);
  - con el cupo agotado, los correos esperan en la cola y salen solos cuando se renueva;
  - se reserva el 10 % del cupo para correos de seguridad (recuperar contraseña e invitaciones): las
    cotizaciones dejan de salir al 90 %, para que un enlace de recuperación no espere al día
    siguiente y venza.

### 5.3 Recuperar contraseña (reemplaza lo actual)
**Flujo:**
1. La persona toca "¿Olvidaste tu contraseña?" e ingresa su correo.
2. Le llega un enlace `/restablecer?token=…`.
3. Escribe la nueva contraseña dos veces.
4. Recibe un correo de aviso: "tu contraseña cambió".

**Reglas (OWASP Forgot Password):**
- La respuesta es la misma, y tarda lo mismo, exista o no el correo.
- **Token:** 32 bytes de `crypto.randomBytes`.
  - En la base solo se guarda su SHA-256.
  - Vence en 30 minutos y sirve una sola vez.
  - Pedir uno nuevo anula los anteriores.
- **Límites:** 3 pedidos por hora por cuenta y 10 por hora por IP; los intentos de canje también
  tienen límite. Se implementa con middleware propio, sin librería.
- El enlace se arma con `APP_PUBLIC_URL`, nunca con la cabecera Host. La página usa
  `Referrer-Policy: no-referrer`.
- **Al restablecer:**
  - se cierran todas las sesiones (tabla `token`);
  - se desbloquea la cuenta si estaba bloqueada;
  - no se inicia sesión automáticamente;
  - queda en `log`.
- Pedir recuperación nunca bloquea la cuenta.
- **Tabla nueva:** `password_reset_token (user_id, company_id, purpose reset|invite, token_hash
  UNIQUE, expires_at, used_at, requested_ip, auditoría)`.
- Se eliminan las rutas `/recovery/*` y la columna `recovery_code`.
- Son rutas públicas por diseño, como `/signin`. Es la única excepción a `authorize(MODULE)`.

### 5.4 Alta de usuario sin "123456" (D13: enlace por correo, sin códigos)
- **Invitación:** el usuario nuevo recibe un correo "Activa tu cuenta" con un enlace que vence en
  72 horas, y elige su contraseña. **Las contraseñas no se mandan por correo.**
- **En Usuarios:** botones "Reenviar invitación" y "Enviar enlace para restablecer".
- **Si el correo no está configurado o falla:** el admin copia el enlace de invitación (o de
  recuperación) y lo manda por WhatsApp. No se generan contraseñas ni códigos (decisión del
  usuario).

### 5.5 Política de contraseñas
- Entre 8 y 128 caracteres, sin reglas de composición obligatorias (criterio NIST SP 800-63B).
- Se rechazan las contraseñas comunes (lista local) y la misma contraseña actual.
- El formulario muestra un medidor de fortaleza.

**Fuera de este sprint:** 2FA (TOTP) para administradores y aviso de inicio de sesión desde un
dispositivo nuevo.

**Terminado cuando:**
- Pedir recuperación con un correo inexistente responde igual que con uno existente.
- El enlace vence a los 30 minutos y sirve una sola vez. Después de usarlo, las sesiones anteriores
  quedan cerradas.
- Un usuario nuevo recibe su invitación y ya no existe la contraseña `123456`.
- Si Brevo falla, el correo queda en la cola y se reintenta solo.

---

## 5b. Ítem 7 — Compartir la cotización (vista pública, WhatsApp y correo)

**Pedido del usuario (12-nov-2026):**
- una vista de la cotización para el cliente, que se vea sin iniciar sesión, para mandarla por
  WhatsApp;
- un interruptor por cotización, encendido por defecto: al apagarlo, el cliente ya no la puede ver;
- un envío por correo, con enlace o PDF, "como salga mejor".

### 5b.1 El enlace
- **Formato:** `https://<dominio>/c/<código>`.
  - El código es aleatorio (128 bits, 22 caracteres), no el número de la cotización.
- **Para el cliente:**
  - no inicia sesión ni escribe nada: abre el enlace y ve la cotización;
  - el enlace no vence.
- **Por qué el código y no el número:** con `/c/123`, cambiando el número cualquiera vería las
  cotizaciones de otros clientes (nombres, precios, direcciones). Con el código, solo la ve quien
  recibió el enlace, igual que "cualquier persona con el enlace" de Google Drive.
- **Interruptor "Visible para el cliente"** en el detalle de la cotización:
  - encendido por defecto;
  - apagado, el enlace muestra "Esta cotización ya no está disponible" y el PDF responde 404;
  - al volver a encenderlo, el mismo enlace funciona otra vez.
- **"Generar enlace nuevo":** anula el anterior para siempre (por si se mandó a la persona
  equivocada).
- **Estados:**
  - una cotización "Pendiente de cotizar" (incompleta) no se puede compartir;
  - una vencida, rechazada o cancelada se ve con un aviso de su estado (o se apaga con el
    interruptor).

### 5b.2 Lo que ve el cliente
- **Lo mismo que el PDF:**
  - logo y datos de la empresa;
  - número, fecha, validez y cliente;
  - productos con color y técnica, cantidades, precios, IGV y total;
  - condiciones y cuentas de pago.
- **Botones:** "Descargar PDF" y "Escribir por WhatsApp" (al número de la empresa o tienda).
- **Nunca se muestra:** costos, ganancia, gastos, compras, pagos internos, historial ni notas
  internas.
- **Presentación:** página con la marca de la empresa, sin el menú de Vanys ni el aviso
  "Instala Vanys".
- **Protecciones:**
  - `noindex`, para que no aparezca en Google;
  - `Referrer-Policy: no-referrer`;
  - límite de consultas por IP.
- **Registro de vistas:**
  - en el detalle, "Visto por el cliente: 12/11 15:30 (3 veces)";
  - en el historial, un evento la primera vez.

### 5b.3 WhatsApp (gratis, sin la API de Meta)
- **Botón "Enviar por WhatsApp"** en el detalle. Abre un diálogo con:
  - el celular del cliente, tomado de su ficha y editable;
  - un mensaje editable: "Hola {cliente}, te enviamos la cotización N.° {número} de {empresa}:
    {enlace}".
- **En la PC** abre `wa.me/51…?text=…`. **En el celular** además ofrece "Compartir PDF" (el menú
  de compartir del teléfono).
- **El número se normaliza:** 9 dígitos que empiezan con 9 → se antepone 51.
- **Queda en el historial:** "Enviada por WhatsApp a 9XX XXX XXX". Se registra el clic, porque
  WhatsApp no confirma la entrega.

### 5b.4 Correo: enlace + PDF adjunto (recomendado)
- **Un solo correo** con un resumen (número, total, validez), el botón "Ver cotización" (el enlace)
  y el PDF adjunto.
- **Por qué los dos:**
  - el enlace siempre muestra la versión vigente y avisa cuándo la abrió el cliente;
  - el PDF sirve para reenviarlo dentro de su empresa (compras, contabilidad) y archivarlo.
  - Brevo acepta adjuntos de hasta ~4 MB y 20 MB por correo; el PDF de una cotización pesa mucho
    menos.
- **Diálogo:**
  - para (correo del cliente, editable) y copia (opcional);
  - asunto y mensaje editables;
  - casilla "Adjuntar PDF", marcada por defecto.
- **Remitente:** "{Empresa} vía Vanys" `<no-reply@dominio>`, con `Reply-To` al correo de la
  empresa, para que la respuesta del cliente le llegue a la empresa.
- **Advertencia en el diálogo:** apagar el interruptor desactiva el enlace, pero un PDF ya enviado
  no se puede recuperar.
- **Envío:** va por la cola de correos (5.2), con reintentos. Queda en el historial: "Enviada por
  correo a x@y.com".
- **Cupo:** se comparte con el resto de correos de la plataforma. Los avisos a los Super
  Administradores y la reserva para correos de seguridad están en la sección 5.2.

### 5b.5 Diseño técnico
- **Tabla** `quotation_public_link (company_id, quotation_id UNIQUE, code CHAR(22) UNIQUE,
  enabled DEFAULT true, view_count, first_viewed_at, last_viewed_at, regenerated_at,
  auditoría)`. Se crea la primera vez que se comparte.
- **Endpoints con sesión** (módulo `cotizacion`):
  - `GET /quotation/:id/public-link`: lo crea si no existe y devuelve URL y estado;
  - `PUT /quotation/:id/public-link`: cambia `enabled`;
  - `POST /quotation/:id/public-link/regenerate`;
  - `POST /quotation/:id/send-email`: deja el correo en la cola.
- **Endpoints públicos** (sin sesión ni API key, con límite por IP):
  - `GET /api/public/q/:code`: datos para la página;
  - `GET /api/public/q/:code/pdf`: reutiliza `quotation_pdf.service.ts`.
  - Se montan aparte de las rutas `/public` actuales, que exigen API key.
  - Son de solo lectura por diseño, como `/signin`.
- **Frontend:**
  - la ruta `/c/:code` se monta antes del cambio entre "con sesión" y "sin sesión": hoy
    `PublicRoutes` manda todo a `/login` y `PrivateRoutes` no la conoce;
  - la página `QuotationPublicPage` va sin `Shell`;
  - `InstallAppPrompt` no aparece en esa ruta.
- **RBAC:** `cotizacion.share.whatsapp.button`, `cotizacion.share.email.button` y
  `cotizacion.publicLink.manage.button` (interruptor y enlace nuevo).
- **Pruebas:**
  - con el enlace apagado, 404 en los datos y en el PDF;
  - un código inválido da 404 sin pistas;
  - la respuesta pública no trae campos internos (la prueba compara las claves);
  - el límite por IP funciona;
  - generar un enlace nuevo invalida el anterior;
  - el correo queda en la cola con el adjunto.

**Terminado cuando:**
- Desde el detalle se manda por WhatsApp. El cliente abre el enlace en su celular, sin cuenta, ve la
  cotización con la marca de la empresa y baja el PDF.
- Al apagar el interruptor, el mismo enlace muestra "no disponible"; al encenderlo, vuelve.
- El correo llega con el botón y el PDF adjunto, y la respuesta del cliente llega al correo de la
  empresa.
- El detalle muestra cuándo la vio el cliente.

---

## 5c. Ítem 8 — Fix: campos que se descuadran en Nueva cotización

**Reporte del usuario (12-nov-2026, con captura):** en cada producto de "Nueva cotización", cuando
aparece un mensaje debajo de un campo, los campos de esa fila se desalinean. En la captura,
"Cantidad" queda más arriba que "Modo de precio" y "Precio producto (S/)".

**Causa:**
- La fila de campos es `flex flex-wrap items-end`
  ([CreateQuotationDialog.tsx:853](../../grulla_fe/src/modules/quotations/components/CreateQuotationDialog.tsx#L853)):
  alinea cada columna por abajo.
- Debajo de "Cantidad" aparece "Mínimo: 25" o "Debajo del mínimo" (`MinOrderNotice`). Esa columna
  crece, y su etiqueta y su campo suben respecto de los demás.
- Pasa lo mismo con cualquier mensaje de error debajo de un campo, y en la fila de Producto y
  Técnica (`grid … items-end`, línea 742).

**Arreglo:**
- Alinear las dos filas por arriba (`items-start`): etiquetas y campos quedan a la misma altura y
  los mensajes cuelgan debajo sin mover nada.
- Revisar que los botones "+" y el texto "Sin personalización" sigan alineados.
- Una búsqueda en el frontend confirmó que el patrón solo está en ese formulario.

**Tamaño:** XS.

**Terminado cuando:** con "Mínimo", "Debajo del mínimo" o un error visible, las etiquetas y los
campos de la fila siguen alineados, en PC y en celular. Una prueba visual de Playwright lo cubre.

---

## 5d. Ítem 9 — Mismos formularios de cliente y producto en Nueva cotización

**Pedido del usuario (13-nov-2026):** "el modal de registrar cliente y producto desde la vista de
cuando estamos creando una cotización tiene que ser igual al que tiene en los módulos de cada cual".

**Hoy:** Nueva cotización tiene sus propios diálogos rápidos (`QuickCreateClientDialog`,
`QuickCreateProductDialog`) con menos campos y otras reglas que los formularios de Clientes y
Productos.

**Arreglo:**
- Extraer el formulario de cada módulo a un componente reutilizable (mismos campos, validación,
  mensajes y botones).
- Usarlo tanto en su módulo como en Nueva cotización. Al crear desde la cotización, el registro nuevo
  queda elegido en el selector.
- Borrar los diálogos rápidos. CLAUDE.md §7: un solo componente para la misma necesidad, sin
  versiones a medio migrar.

**Tamaño:** S.

**Terminado cuando:** crear un cliente o un producto desde Nueva cotización muestra exactamente el
mismo formulario que en su módulo, y los e2e de clientes, productos y cotizaciones pasan.

---

## 6. Ítem 5 — Kanban de producción configurable

**Cómo funciona hoy:**
- Las etapas son filas de `general_variable` (categoría `production_stage`): 4 globales (Diseño →
  Insumos → Producción → Listo) más las que agregue cada empresa, ordenadas por `ref2`, que es texto.
- **Limitaciones:**
  - Una empresa no puede ocultar ni reordenar las globales.
  - Un producto solo pasa a la etapa vecina
    ([quotation_item.service.ts](../../grulla_be/src/api/modules/quotation/services/update/quotation_item.service.ts)).
  - Las etapas deshabilitadas no se filtran.
  - El historial es solo un texto en la línea de tiempo.
- El frontend carga todas las variables generales sin paginar y filtra en el navegador.

**Propuesta (Configuración → "Flujo de producción"):**
- **Columnas propias:** cada empresa las agrega, renombra, colorea, reordena arrastrando y desactiva.
- **Tipo de columna:** Por hacer, En curso o Terminado (como las categorías de estado de Jira). Así
  las estadísticas funcionan aunque cada empresa nombre sus columnas como quiera.
- **Modo de flujo (D10: Lineal y Libre):**
  - Lineal: solo a la columna siguiente o anterior, como hoy.
  - Libre: a cualquier columna.
  - El modo Personalizado (matriz "desde → hacia") queda para después.
- **Alcance (D11):** la configuración es por empresa; todas sus tiendas usan las mismas columnas.
- **Opción automática:** "cuando todos los productos llegan a Terminado, la cotización pasa a
  Lista".
- **Desactivar una columna con productos:** pide a qué columna moverlos. Se mueven todos juntos, en
  una transacción, y queda en el historial.
- **Historial por producto:** quién lo movió, cuándo, desde y hacia. Sirve para medir el tiempo en
  cada etapa.
- **Sugerencia extra:** un tablero de producción global, con todos los productos de las
  cotizaciones activas por etapa, para el jefe de producción.

**Diseño técnico:**
- **Tablas nuevas.** No se reutiliza el nombre `production_stage`: una migración vieja tiene
  `DROP TABLE production_stage` en su `down`.
  - `production_workflow (company_id UNIQUE, flow_mode linear|free, allow_backward,
    auto_ready_quotation, auditoría)`
  - `production_workflow_stage (company_id, name, color, position, category todo|doing|done,
    active, auditoría)`
  - `quotation_item_stage_log (company_id, quotation_item_id, from_stage_id, to_stage_id,
    auditoría)`
- **Migración** (idempotente):
  - en cada empresa copia las etapas globales y las propias, en su orden actual;
  - re-apunta `quotation_item.stage_id` usando un mapa de id viejo → id nuevo;
  - cambia la llave foránea a la tabla nueva.
  - Las empresas nuevas nacen con las 4 etapas por defecto.
- **Endpoints:**
  - ver y guardar la configuración (columnas, orden y modo en un solo PUT transaccional);
  - listar etapas para el kanban (en caché);
  - historial de un producto.
- **Al mover un producto,** el backend valida según el modo, con un validador por modo y sin `if`
  anidados.
- **RBAC:** módulo `production_workflow`. La configuración es solo para administradores; mover una
  etapa sigue en `cotizacion`.

**Terminado cuando:**
- La empresa A reordena y renombra sus columnas sin afectar a la empresa B.
- En modo libre se puede saltar etapas.
- Desactivar una columna con productos obliga a moverlos.
- La migración conserva la etapa de cada producto existente y el historial muestra los tiempos.

---

## 7. Ítem 6 — Consulta de stock de proveedores

**Referencia de mercado:**
- En la industria de productos promocionales de EE. UU., los proveedores publican su inventario con
  un estándar (PromoStandards, servicio *Inventory*).
- Sistemas como commonsku muestran ese stock en vivo mientras se cotiza.
- En Perú las importadoras mandan un enlace a un Excel. Este módulo da lo mismo con esos archivos y
  queda listo para conectar una API si algún proveedor la ofrece (`source_type`).

**Lo que ya existe:** `product_code` permite varios códigos por producto, con proveedor (texto) y
color. El código es único dentro de la empresa.

**Propuesta funcional:**
- Se activa por empresa: el Super Administrador enciende `supplier_stock`.
- **Fuentes por empresa:**
  - proveedor, nombre, enlace del Excel y frecuencia de actualización;
  - mapeo de columnas: hoja, fila de encabezado, código, color, descripción, stock y precio
    (opcional).
- **"Probar fuente":** descarga el archivo y muestra las primeras filas, y cómo se leyó cada
  columna, antes de guardar.
- **Actualización:** automática cada N horas (por el job) y con un botón "Actualizar ahora".
- **Al cotizar:**
  - al elegir producto, color y cantidad aparece
    `Proveedor A: 800 · Proveedor B: 400 · Total: 1 200`, con la hora de actualización;
  - se marca en rojo si no alcanza;
  - avisa si el dato tiene más de X horas.
- **Cada fuente se muestra por separado, más el total, sin mezclar filas** (pedido del usuario).
- **Pantalla "Stock de proveedores":**
  - busca por código o nombre, con una columna por fuente y el total;
  - lista las filas del Excel sin producto vinculado, para enlazarlas.

**Diseño técnico:**
- **Tablas:**
  - `supplier_stock_source (company_id, supplier_id, name, source_type excel_url|api,
    url_encrypted, file_format, sheet, header_row, column_map JSON, parse_rules JSON,
    refresh_minutes, last_success_at, last_status, last_error, active, auditoría)`
  - `supplier_stock_import (company_id, source_id, started_at, finished_at, status, rows_read,
    rows_matched, file_sha256, error, auditoría)`: historial de importaciones.
  - `supplier_stock_item (company_id, source_id, import_id, code_raw, code_norm, color_code,
    description, quantity, quantity_text, price, auditoría)`, con índice `(company_id, code_norm)`.
- **Reemplazo atómico:** las filas nuevas se cargan con su `import_id`, y recién al terminar se
  marcan como vigentes y se borran las anteriores. Si algo falla, se sigue mostrando la última
  importación buena.
- **Coincidencia:**
  - el código se normaliza: mayúsculas, sin espacios, guiones ni puntos;
  - se compara contra `product_code.code` (con `supplier_id`) y contra el SKU;
  - las reglas propias de cada fuente (ej. `E1000-02` = código padre + color) se definen al ver los
    Excel.
- **Cantidades escritas como texto** ("+500", ">1000", "Agotado"): se interpretan con reglas propias
  de cada fuente.
- **Descarga segura (SSRF):**
  - solo `https`;
  - se resuelve el DNS y se rechazan las IP privadas o locales;
  - cada redirección se valida;
  - tope de tamaño (ej. 20 MB) y de tiempo.
  - Los enlaces de Google Drive o Sheets, OneDrive y Dropbox se convierten a descarga directa.
- **Lectura en un `worker_thread`** con límite de memoria y de tiempo: no traba el servidor y lo
  protege de archivos que se inflan al descomprimirse.
- **Librería (aprobada, sección 12):** SheetJS CE 0.20.x desde su CDN oficial.
  - Lee `.xlsx`, `.xls` y `.csv`.
  - El paquete de npm está abandonado.
  - ExcelJS solo lee `.xlsx` y tiene avisos de seguridad abiertos con archivos comprimidos.
- **Consulta en lote para la cotización:** `GET /supplier-stock/lookup?productIds=…`. Es una sola
  llamada para todo el formulario, guardada en caché con React Query (CLAUDE.md §8).
- **Códigos repetidos entre proveedores (D6: sí, único por proveedor):**
  - el índice único pasa de `(company_id, code)` a `(company_id, supplier_key, code)`, con
    `supplier_key = COALESCE(supplier_id, 0)` para que los códigos sin proveedor tampoco se repitan;
  - se mantiene la regla "un SKU no puede ser el código de otro producto";
  - una búsqueda por código puede devolver varios productos: la pantalla muestra el proveedor para
    distinguirlos.

**Lo que necesito:** los Excel de cada proveedor (idealmente 2 por proveedor, de días distintos) y
sus enlaces.

**Terminado cuando:**
- Una fuente de prueba se importa.
- Un producto con códigos en 2 fuentes muestra, en Nueva cotización, la cantidad de cada fuente y el
  total, con una sola llamada.
- Si la descarga falla, se sigue viendo la última importación, con aviso.
- Un enlace que apunta a una IP privada se rechaza.

---

## 8. Ítem 2 — Almacenes e inventario

### 8.1 Activación (3 niveles, como se pidió)
1. **Empresa:** el Super Administrador activa `inventory`.
2. **Tienda:** el admin activa "Usa almacén" en cada tienda (`business_unit.inventory_enabled`).
3. **Almacén:** cada tienda tiene uno o varios almacenes, y cada uno se activa o desactiva. No se
   puede desactivar si tiene stock distinto de 0 o transferencias abiertas.

Con la funcionalidad activa, cada producto muestra **"Maneja stock"**: los intangibles y servicios
lo dejan apagado. Al activar el inventario (D14), los productos existentes arrancan apagados y se
encienden en bloque con un filtro; los nuevos nacen encendidos.

### 8.2 Configuración por almacén
- **Permitir stock negativo:** sí o no.
- **Controla lotes:** sí o no.
- **Controla vencimiento:** sí o no; requiere lotes.
  - Se configuran los días de aviso antes del vencimiento.
  - Se puede bloquear la salida de lotes vencidos.
  - Solo pide fecha a los productos perecibles.
- **Datos para la GRE:** dirección, ubigeo y código de establecimiento SUNAT (el punto de partida).
- **Regla (D5, decidido):** lotes y stock negativo no se activan juntos en un almacén. Un lote en negativo no
  tiene sentido, y ERPNext lo prohíbe desde su versión 15.

### 8.3 Documentos
Todos llevan número propio, estado y auditoría. Lo confirmado nunca se edita: se anula con un
movimiento inverso.

| Documento | Para qué | Estados |
|---|---|---|
| Ingreso (NI) | Compra, devolución de cliente, inventario inicial, producción | borrador → confirmado → anulado |
| Salida (NS) | Venta o entrega, consumo interno, merma, muestra, devolución a proveedor | borrador → confirmado → anulado |
| Transferencia (TR) | Entre almacenes de la misma tienda o de tiendas distintas | borrador → despachada (en tránsito) → recibida / recibida parcial; se anula solo en borrador |
| Ajuste (AJ) | Corregir diferencias, con motivo | borrador → confirmado |

- **Transferencia entre establecimientos distintos:** al despacharla pide la GRE con motivo 04
  (ítem 1). En una recepción parcial, la diferencia queda registrada como merma en tránsito o como
  pendiente.
- **Lotes:** al ingresar se pone el lote (o se genera) y el vencimiento si corresponde. Al sacar, el
  sistema sugiere el lote que vence primero (FEFO), y se puede cambiar.
- **Kardex (historial):**
  - por producto, color y almacén, en un rango de fechas;
  - muestra el saldo acumulado, el documento de origen y el usuario;
  - se exporta a Excel o PDF.
- **Stock actual:** por almacén y consolidado.
- **Alertas a la campana:** stock bajo el mínimo (por producto y almacén) y lotes por vencer.
- **Carga inicial:** plantilla de inventario inicial por almacén.

### 8.4 Integraciones
- **Compras:**
  - al registrar una compra en una tienda con almacén se ofrece "Ingresar al almacén X";
  - el costo unitario es el monto entre la cantidad.
- **Cotización:** al elegir un producto se ve el stock propio, por almacén, junto al de proveedores
  (ítem 6).
- **Entrega (D4):** la salida se genera al emitir la GRE o al marcar la cotización como Entregada.
  Se configura por tienda. Como la GRE va al final del sprint, hasta entonces la salida se genera
  al marcar Entregada.

### 8.5 Diseño técnico
- **Tablas:**
  - `warehouse (company_id, business_unit_id, code, name, address, ubigeo,
    sunat_establishment_code, allow_negative_stock, track_lots, track_expiry, expiry_alert_days,
    block_expired, is_default, active, auditoría)`
  - `stock_document (company_id, business_unit_id, warehouse_id, target_warehouse_id, doc_type,
    reason_code, series, number, status, document_date, supplier_id, client_id, quotation_id,
    purchase_id, dispatch_guide_id, notes, posted_at/by, cancelled_at/by, cancel_reason, auditoría)`
  - `stock_document_line (company_id, document_id, product_id, product_color_id, lot_id,
    quantity DECIMAL(14,3), received_quantity, unit_cost, auditoría)`
  - `stock_lot (company_id, product_id, product_color_id, lot_code, expiry_date, supplier_id,
    auditoría)`: único por producto, color y código.
  - `stock_movement`, libro inmutable: `company_id, warehouse_id, product_id, product_color_id,
    lot_id, quantity (+/−), unit_cost, document_line_id, movement_at, auditoría`. Índice
    `(warehouse_id, product_id, product_color_id, movement_at, id)`.
  - `stock_balance (company_id, warehouse_id, product_id, product_color_id, lot_id, on_hand,
    reserved, avg_cost)`: único por esa combinación.
- **Cómo se mueve el stock:**
  - `stock_balance` se actualiza en la misma transacción que `stock_movement`, con
    `SELECT … FOR UPDATE` en orden fijo (evita carreras y bloqueos cruzados).
  - Si el almacén no permite negativo y el saldo quedaría bajo 0, responde 409 `INSUFFICIENT_STOCK`
    con el detalle.
- **Tránsito:**
  - el despacho resta del origen y suma a un almacén virtual "En tránsito" de la empresa;
  - la recepción lo pasa al destino.
- **Costeo (D3, decidido):** promedio ponderado por producto y color, a nivel empresa. Los costos solo se ven
  con el permiso "Ver costos".
- **Cantidades en `DECIMAL(14,3)`:** hoy todo es entero, pero esto deja espacio para kilos o metros.
- **RBAC:**
  - **Módulo** `inventory`.
  - **Vistas:** almacenes, stock, documentos, transferencias y kardex.
  - **Botones:** crear, confirmar y anular por tipo; despachar; recibir; configurar almacén; ver
    costos.
  - **Alcance:** un usuario ligado a una tienda ve y opera los almacenes de su tienda. En una
    transferencia, despacha el origen y recibe el destino.
- **Menú:** grupo nuevo "Inventario".

**Marco legal** (para dimensionar; confirmar con el contador):
- El art. 35 del Reglamento de la Ley del Impuesto a la Renta exige:
  - más de 1 500 UIT de ingresos: inventario permanente valorizado (formato 13.1);
  - entre 500 y 1 500 UIT: inventario en unidades físicas (formato 12.1).
- Con la UIT 2026 de S/ 5 500, esos topes son S/ 8,25 M y S/ 2,75 M de ingresos al año.
- El kardex de este sprint deja la base para exportar esos formatos más adelante.

**Para un sprint posterior:**
- reservas por cotización (disponible = físico − reservado);
- tomas de inventario y conteos;
- ubicaciones (estante, pasillo);
- etiquetas y lectura de códigos con la cámara;
- números de serie, kits y conversión de unidades;
- exportación PLE 12.1 y 13.1;
- reposición sugerida.

**Terminado cuando:**
- En un almacén sin negativo, de dos salidas simultáneas que superan el stock, una pasa y la otra
  recibe 409.
- Una transferencia entre tiendas resta del origen y se ve "en tránsito". Una recepción parcial deja
  la diferencia registrada.
- El kardex cuadra con el saldo.
- Un lote por vencer genera su alerta.
- Anular un documento confirmado crea el movimiento inverso, visible en el kardex.

---

## 9. Ítem 1 — Guía de remisión electrónica (GRE remitente)

### 9.1 Reglas vigentes en 2026 (Perú)
- **Electrónica:** la GRE remitente es electrónica. La guía en papel solo se usa en contingencia, por
  causas ajenas al emisor.
- **Multas al remitente desde el 1-sep-2026:** SUNAT dejó de perdonarlas el 31-ago-2026
  (RSNATI 000031-2026). Trasladar bienes sin GRE remitente ya se multa. Al transportista lo
  perdonan hasta el 28-feb-2027.
- **R.S. 000108-2026/SUNAT** (vigente desde el 1-jun-2026):
  - si el remitente registra vehículo y conductor, para que el transportista no emita la suya, la
    fecha de inicio del traslado es obligatoria;
  - suma el evento "cambio de conductor";
  - actualiza las estructuras UBL 2.1 y el servicio REST de recepción (Anexos III y IV).
- **Vehículos M1 o L** (auto, moto): se marca el indicador y no se piden placa ni conductor.
- **Serie y plazo:** la serie es `T###` y la guía se emite **antes** de iniciar el traslado.

### 9.2 Datos que lleva la guía
- **Remitente y destinatario:** RUC o DNI.
- **Motivo** (catálogo 20):

  | Código | Motivo |
  |---|---|
  | 01 | Venta |
  | 02 | Compra |
  | 03 | Venta con entrega a terceros |
  | 04 | Traslado entre establecimientos de la misma empresa |
  | 05 | Consignación |
  | 06 | Devolución |
  | 07 | Recojo de bienes transformados |
  | 13 | Otros |
  | 14 | Venta sujeta a confirmación |
  | 17 | Traslado para transformación |

- **Fecha de inicio del traslado.**
- **Puntos de partida y de llegada:** con ubigeo, y con código de establecimiento cuando el traslado
  es entre establecimientos.
- **Modalidad:**
  - pública: RUC y razón social del transportista;
  - privada: placa, y conductor con DNI y licencia.
- **Bienes:** descripción, cantidad, unidad y peso bruto total.
- **Documentos relacionados:** factura, entre otros.

**Usos en este negocio** (confirmar con el contador):

| Situación | Motivo |
|---|---|
| Entrega al cliente | 01 |
| Envío a un taller para personalizar | 17 |
| Retorno del taller | 07 |
| Traslado entre tiendas o almacenes | 04 |
| Recojo de una compra con transporte propio | 02 |

### 9.3 Opciones de emisión (D1: A + C)

| Opción | Costo por guía | Esfuerzo | Riesgo | Notas |
|---|---|---|---|---|
| **A. SUNAT directo** (SEE-Del Contribuyente): firmamos el XML y lo enviamos al API REST | S/ 0 | Alto | Medio: no hay un ambiente de pruebas claro | Cada empresa sube su certificado y sus credenciales API de SOL. SUNAT da el certificado gratis (CDT, programa vigente hasta el 31-dic-2027). Necesita librerías de firma y zip. La misma base sirve después para facturas |
| **B. PSE** (ej. Nubefact): mandamos JSON y el PSE firma y envía | ~S/ 70 al mes por empresa (referencia no oficial, hasta 500 documentos) | Medio-bajo | Bajo | Cada empresa contrata su cuenta, o la plataforma actúa de revendedor. Depende de un tercero |
| **C. Manual:** el sistema arma la guía, se emite en SUNAT (SEE-SOL o App Emprender) y se registran el número y el PDF | S/ 0 | Bajo | Sin riesgo técnico | Se digita dos veces. Sirve de contingencia |

**Decidido (D1): A (directo a SUNAT) + C (manual de respaldo).**
- El módulo usa un **proveedor de emisión intercambiable**.
- Todo lo de SUNAT va **al final del sprint**, por decisión del usuario: hay que hacerlo con
  cuidado para no caer en multas.
- Primero sale la opción C (manual). Después, una **prueba técnica de 2 a 3 días con el RUC
  propio**: credenciales API, firma, envío, ticket, CDR y QR. Recién con la prueba aprobada se
  construye la opción A.
- **Cuidado en la prueba:**
  - cada guía que SUNAT acepta es un documento real;
  - solo se emiten guías de traslados que de verdad ocurren;
  - nunca hay pruebas automáticas contra SUNAT.
- Si la prueba falla o se alarga, se pasa a B (PSE) sin rehacer el módulo.
- Mientras el módulo no exista, cada traslado sigue necesitando su GRE emitida en SUNAT (portal SOL
  o App Emprender): las multas al remitente corren desde el 1-sep-2026.

**Lo que la empresa saca en SOL** (gratis, una sola vez, con la Clave SOL principal):
1. **Usuario secundario para el sistema:** Administración de usuarios → Crear usuario.
   - Así el sistema no guarda la Clave SOL principal.
   - Si se renueva la Clave SOL principal, SUNAT anula los usuarios secundarios y hay que crearlo
     de nuevo.
2. **Credenciales API** (`client_id` y `client_secret`): en "Credenciales de API SUNAT".
3. **Certificado digital gratuito (CDT):** Empresas → Comprobantes de pago → Certificado Digital
   Tributario → Solicitar.
   - Llega al Buzón SOL como `.p12` y dura 3 años.
   - Requisitos: RUC activo y habido, renta de 3ra categoría, no ser OSE/PSE e ingresos de 2019
     ≤ S/ 1 260 000 (o inicio de operaciones en 2020 o después).
   - Si la empresa no califica: certificado de una entidad acreditada por INDECOPI (pago anual).

**Por confirmar en la prueba:** el perfil exacto que necesita el usuario secundario y si hay que
registrar el certificado en SOL antes de emitir.

### 9.4 Flujo en el sistema
1. **Crear la guía desde:**
   - una cotización Lista o Entregada: precarga el cliente, la dirección de entrega y los productos
     con lo que falta despachar;
   - una transferencia de almacén (motivo 04);
   - cero, a mano.
2. **Emitir:**
   - valida los datos y toma el número de la serie;
   - arma el XML UBL 2.1, lo firma, lo comprime y lo envía;
   - guarda el ticket al instante.
3. **Consultar el ticket** (job con espera creciente):

   | Código | Significado | Qué hace el sistema |
   |---|---|---|
   | 0 | Aceptada | Guarda el CDR |
   | 98 | En proceso | Vuelve a consultar más tarde |
   | 99 | Rechazada | Guarda el motivo, y el CDR si existe |

4. **Imprimir y enviar:** PDF con QR, en A4 o ticket de 80 mm, y envío por correo y por WhatsApp.
5. **Entregas parciales:** una cotización puede tener varias guías. Se controla lo despachado por
   producto.
6. **Con almacén activo:** la guía de venta genera la salida (D4) y la de motivo 04 nace de la
   transferencia.
7. **Baja de la guía y GRE por eventos:** según lo que confirme la prueba técnica. Algunas fuentes
   dicen que la baja solo se hace en SOL; el sistema la registra.

### 9.5 Diseño técnico
- **Tablas:**
  - `company_sunat_settings (company_id UNIQUE, emission_mode manual|sunat_direct|pse, sol_user,
    sol_password_enc, api_client_id, api_client_secret_enc, certificate_enc,
    certificate_password_enc, certificate_expires_at, pse_token_enc, last_error, auditoría)`.
    Solo la edita el admin de la empresa o el Super Administrador; los secretos nunca se devuelven.
  - `dispatch_guide`:
    - identificación: `company_id, business_unit_id, series, number, status
      (draft|sending|accepted|rejected|error|manual|voided), issue_date, transfer_start_date`;
    - traslado: `reason_code, reason_note, transport_mode (public|private), light_vehicle,
      gross_weight_kg, packages`;
    - puntos: `origin_*` (almacén, dirección, ubigeo, establecimiento) y `destination_*`
      (dirección del cliente, ubigeo, establecimiento);
    - destinatario y transportista: `recipient_doc_type, recipient_doc_number, recipient_name,
      carrier_supplier_id`;
    - vínculos: `quotation_id, stock_document_id`;
    - SUNAT: `sunat_ticket, sunat_code, sunat_message, sunat_observations, accepted_at`;
    - auditoría.
  - `dispatch_guide_line (company_id, guide_id, product_id, quotation_item_id, description,
    quantity, unit_code, color, weight_kg, auditoría)`
  - `dispatch_guide_transport (company_id, guide_id, kind vehicle|driver, plate, driver_doc_type,
    driver_doc_number, driver_name, license_number, is_main, auditoría)`
  - `dispatch_guide_related_document (company_id, guide_id, doc_type, series_number, issuer_ruc,
    auditoría)`
  - `dispatch_guide_file (company_id, guide_id, kind xml|cdr|pdf, content LONGBLOB, sha256,
    auditoría)`. Va en la base y no en disco, porque Hostinger borra el disco en cada despliegue.
  - `transport_vehicle` y `transport_driver`: catálogos por empresa.
- **Token OAuth de SUNAT:** se guarda en memoria por empresa hasta poco antes de vencer y nunca se
  registra en logs.
- **RBAC:**
  - **Módulo** `dispatch_guide`.
  - **Vistas:** lista, detalle y configuración SUNAT.
  - **Botones:** crear, emitir, registrar la baja, descargar PDF/XML/CDR y configurar credenciales.
- **Menú:** grupo "Logística" (Guías, Vehículos, Conductores).

**Terminado cuando:**
- Se emite una guía de venta desde una cotización, con transporte privado en vehículo M1, y SUNAT la
  acepta: hay CDR y PDF con QR.
- Una guía rechazada muestra el motivo que dio SUNAT.
- Dos emisiones simultáneas no duplican ni saltan números.
- El modo manual registra el número y el PDF.

---

## 10. Módulos nuevos propuestos (para ser "el rey" de las cotizaciones)

> **Decisión del usuario (12-nov-2026): estos módulos no entran (D17).** Solo el envío por WhatsApp
> pasó al sprint, con cambios, como ítem 7 (sección 5b). Esta sección queda como referencia.

### 10.1 Lo que más vende (investigación del 12-nov-2026)

**Envío por WhatsApp, gratis y simple** (sin API de Meta ni costo por mensaje):
- **En el celular** (Vanys ya se instala como app): el botón abre el menú de compartir del teléfono
  (Web Share API con archivos) y se manda el PDF al chat del cliente.
- **En la PC:** el botón abre `wa.me/51<número>?text=…` con un mensaje ya escrito y un enlace
  público a la cotización. El vendedor solo presiona Enviar.
- **El enlace público:**
  - usa un token aleatorio, no el id de la cotización;
  - se puede desactivar;
  - registra cuándo lo abrió el cliente.
  - Es la base del portal del cliente.
- **Descartado:**
  - enviar sin que nadie presione "Enviar": exige la API oficial de WhatsApp (pago por mensaje y
    verificación ante Meta);
  - los bots que automatizan WhatsApp Web: rompen sus reglas y arriesgan el número.
- **Esfuerzo:** S.

**A. Para que los clientes de Vanys cierren más cotizaciones:**

| Módulo | Qué hace | Evidencia |
|---|---|---|
| Portal + aceptación en línea | El cliente ve la cotización desde el enlace, la acepta con nombre y DNI y sigue el estado de su pedido | Proposify (742 137 propuestas, 2026): con firma electrónica, 15 % más cierres y 60 % más rápido |
| Opciones que el cliente elige | Alternativas o adicionales opcionales en la misma cotización; el total se recalcula | Proposify: con precios interactivos se ganan 2 veces más propuestas |
| Aprobación de diseños | Mockup por producto; el cliente aprueba o pide cambios; el producto no sale de "Diseño" sin aprobación | Función central del software del rubro (Printavo, presentaciones de commonsku) |
| Respuesta rápida y seguimiento | Aviso inmediato de pedidos web; recordatorio al vendedor si el cliente no abre o no responde | HBR 2011: responder en la primera hora ≈ 7 veces más probabilidad de calificar al cliente (cifra citada por fuentes secundarias) |
| Cobro del adelanto en línea | Enlace de pago (MercadoPago, Izipay, Culqi) o QR de Yape en el portal, con subida del voucher | CotizzaPro (competidor peruano) ya cobra con MercadoPago |
| Tienda corporativa | Catálogo privado para clientes que repiten pedidos | commonsku la vende como "Shops"; aprovecha el catálogo web actual |

**B. Para que Vanys se venda más como sistema:**

| Módulo | Por qué |
|---|---|
| Facturación electrónica SUNAT | Los competidores peruanos revisados (Mifact, Simple, Facturación Electrónica Perú, CotizzaPro) traen cotización y factura juntas. Reutiliza lo de la GRE (D1) |
| Registro en línea + planes + prueba gratis | Hoy cada empresa la crea el Super Administrador. Con registro propio, prueba gratis y planes que encienden módulos (tabla `company_feature`), el sistema se vende sin intervención. CotizzaPro tiene un plan gratis de 25 cotizaciones al mes |
| Importar desde Excel | Clientes, productos y stock inicial: baja la barrera de empezar (SheetJS ya aprobado) |
| Stock de proveedores al cotizar | Ya está en el Sprint 2; no aparece en los competidores locales revisados |
| WhatsApp | Todos los competidores lo destacan; el 98 % de los usuarios urbanos de Perú usa WhatsApp (Andina) |

Las cifras de Proposify salen de su propia plataforma, no de un estudio independiente.

**Hoja de ruta:** no adoptada; el usuario decidió no sumar estos módulos por ahora (D17).

### 10.2 Lista completa de módulos propuestos

Ya existen, y por eso no los propongo:
- estadísticas, recordatorios, cuentas por cobrar, caja y cierres;
- deudas de trabajadores;
- catálogo y pedidos desde la web, anuncios y copia a Drive.

| # | Módulo | Qué resuelve | Valor | Esfuerzo |
|---|---|---|---|---|
| 1 | **Portal del cliente y aceptación en línea** | El cliente abre un enlace de la cotización, sin cuenta: la ve, baja el PDF, la acepta o rechaza con nombre y DNI y comenta. Sabemos cuándo la abrió. Paga el adelanto con el QR de Yape o Plin y sube el voucher | Muy alto | M |
| 2 | **Aprobación de diseños** | Mockups por producto, con versiones. El cliente los aprueba desde el portal y el producto no sale de "Diseño" sin aprobación. Es la función central de Printavo y sistemas similares | Muy alto | M |
| 3 | **Facturación electrónica SUNAT** | Factura, boleta y nota de crédito desde la cotización aceptada. Reutiliza el certificado, la firma y las credenciales de la GRE | Muy alto | L |
| 4 | **Envío por WhatsApp y correo + seguimiento** | Botón de WhatsApp (enlace `wa.me`, gratis) con un mensaje y el enlace al portal, y correo con el PDF. Si el cliente no responde en N días, se le recuerda al vendedor. La API oficial de WhatsApp cobra por mensaje | Alto | S |
| 5 | **Lectura de facturas con IA** | De la foto de la factura, que ya se toma con la cámara, se sacan RUC, serie, número, fecha y total para llenar los datos del ítem 3. Tiene costo por uso | Alto | S–M |
| 6 | **Compras formales al proveedor** | Orden de compra al proveedor en PDF, recepción contra esa orden (con ingreso al almacén) y cuentas por pagar | Alto | M–L |
| 7 | **Multimoneda** | Cotizar en dólares o soles con el tipo de cambio diario del BCRP (API oficial gratis). Las importadoras suelen cotizar en dólares | Medio-alto | M |
| 8 | **CRM ligero** | Oportunidades, seguimientos, motivos de pérdida y tasa de cierre por vendedor | Medio-alto | M |
| 9 | **Listas de precios y aprobación de descuentos** | Precios por cliente o segmento. Si el margen baja de X %, la cotización pide aprobación | Medio | M |
| 10 | **Versiones de cotización** | v1, v2… comparables y visibles en el portal | Medio | S–M |
| 11 | **Calendario de producción y entregas** | Capacidad por día, fechas comprometidas y atrasos | Medio | M |
| 12 | **Comisiones de vendedores** | Calculadas sobre lo cobrado o sobre el margen | Medio | M |
| 13 | **Seguridad avanzada** | 2FA (TOTP), dispositivos y sesiones activas | Medio | S–M |
| 14 | **Exportar a Excel** | Todos los listados y el kardex (usa la misma librería del ítem 6) | Medio | S |
| 15 | **Opciones que el cliente elige** | Alternativas o adicionales opcionales dentro de la cotización | Muy alto | M |
| 16 | **Cobro del adelanto en línea** | Enlace de pago o QR de Yape en el portal, con subida del voucher | Alto | M |
| 17 | **Registro en línea + planes + prueba gratis** | Alta de empresas sin el Super Administrador, con planes que encienden módulos | Muy alto | L |
| 18 | **Importar desde Excel** | Clientes, productos y stock inicial | Alto | S |
| 19 | **Tienda corporativa** | Catálogo privado para clientes que repiten pedidos | Medio-alto | L |

Ninguno de estos módulos entra por ahora (D17).

**Ventaja frente a la competencia:** stock de proveedores al cotizar, aprobación de diseños y
documentos SUNAT integrados. Los sistemas genéricos no combinan las tres cosas.

---

## 11. Decisiones (cerradas el 12-nov-2026)

Todas las respuestas coincidieron con la recomendación. La excepción es el hotfix de seguridad,
que se resuelve dentro del ítem 4. El detalle de cada respuesta está debajo de la tabla.

| # | Decisión | Decidido |
|---|---|---|
| D1 | GRE: cómo emitir | A (directo a SUNAT) + C (manual). Todo lo de SUNAT al final del sprint, con prueba técnica antes de la emisión directa; B (PSE) si la prueba falla |
| D2 | ¿Stock por producto o por producto + color? | Producto + color: los pedidos y los Excel de las importadoras son por color. Un producto sin colores usa "sin variante" |
| D3 | Costeo | Promedio ponderado por empresa; los costos solo se ven con permiso |
| D4 | ¿Cuándo se descuenta el stock de una venta? | Al emitir la GRE; si la tienda no emite guía desde el sistema, al marcar Entregada. Configurable por tienda |
| D5 | ¿Lotes y stock negativo juntos en un almacén? | No |
| D6 | ¿Puede repetirse un código entre proveedores distintos? | Sí: único por empresa + proveedor + código (hoy es único por empresa). Confirmar con los Excel |
| D7 | ¿Módulo Proveedores mínimo en este sprint? | Sí |
| D8 | ¿Una factura puede juntar compras de varias tiendas? | Sí, dentro de la empresa y solo para admins. El usuario de tienda, solo la suya |
| D9 | ¿Serie-número, proveedor, fecha y total en la factura? | Sí; opcionales al inicio |
| D10 | Modos del kanban | Lineal (por defecto) y Libre en este sprint; Personalizado si hace falta |
| D11 | ¿Flujo de producción por empresa o por tienda? | Por empresa |
| D12 | Proveedor de correo | Brevo; Resend como alternativa |
| D13 | Alta de usuario | Invitación por enlace, sin mandar contraseñas |
| D14 | "Maneja stock" al activar inventario | Apagado en los productos existentes (se enciende en masa); encendido por defecto en los nuevos |
| D15 | Base del sprint | Copia de `grulla_dev`. Una copia de producción solo anonimizada (datos reales de clientes) |
| D16 | Librerías nuevas | Aprobadas todas las de la sección 12 |
| D17 | Módulos extra para vender más (sección 10) | No entran |
| D18 | Compartir la cotización | Sí (ítem 7, sección 5b): vista sin login con interruptor por cotización (encendido por defecto), WhatsApp y correo con enlace + PDF |
| D19 | Facturas | El ítem 3 (vincular varias compras a una factura) sí va, al final del sprint. La facturación electrónica SUNAT no va |
| D20 | Guía de remisión | Sigue en este sprint, al final (primero manual, después directo a SUNAT) |

### Detalle de las respuestas (12-nov-2026)

- **Hotfix de seguridad (§1):** no se hace aparte. Se resuelve al empezar el sprint, dentro del
  ítem 4 (contraseñas).
- **D13:** sin códigos. Por correo llega un enlace para crear la contraseña (usuario nuevo) y un
  enlace para recuperarla.
- **D1:** **directo a SUNAT + modo manual de respaldo** (recomendado). Se decidió después de
  investigar, porque la empresa solo tiene la Clave SOL principal:
  - Todo se saca gratis desde SOL con esa clave:
    1. un **usuario secundario** para el sistema (Administración de usuarios → Crear usuario),
       para no guardar la Clave SOL principal;
    2. las **credenciales API** (`client_id`/`client_secret`), una sola vez, en "Credenciales de
       API SUNAT" (manual oficial de la plataforma nueva GRE). El token dura 1 hora;
    3. el **certificado digital gratuito (CDT)**: SOL → Empresas → Comprobantes de pago →
       Certificado Digital Tributario → Solicitar. Llega al Buzón SOL como `.p12` y dura 3 años.
  - Requisitos del CDT: RUC activo y habido, renta de 3ra categoría, no ser OSE/PSE e ingresos de
    2019 ≤ S/ 1 260 000 (o inicio de operaciones en 2020 o después). Programa vigente hasta el
    31-dic-2027.
  - **No existe un requisito de "más de S/ 100 mil en bienes"**: el CDT tiene un tope máximo de
    ingresos, no un mínimo. Si la empresa no califica, se compra un certificado a una entidad
    acreditada por INDECOPI (pago anual).
  - Pendiente de confirmar en la prueba técnica: el perfil exacto que necesita el usuario
    secundario y si hay que registrar el certificado en SOL antes de emitir.
  - El mismo usuario SOL y el mismo certificado sirven después para **facturas, boletas y notas de
    crédito** directo a SUNAT, por el servicio SOAP de comprobantes. Excepción: si la empresa está
    en la lista oficial de obligados a usar OSE, las facturas pasan por un OSE pagado; la GRE va
    siempre directo a SUNAT.
  - Un PSE firmaría con su propio certificado; queda como plan B si la prueba técnica falla.
- **D2:** stock por producto + color (recomendado).
- **D3:** costo promedio ponderado por empresa (recomendado).
- **D4:** la venta descuenta stock al emitir la GRE, o al marcar Entregada si no se emite guía;
  configurable por tienda (recomendado).
- **D5:** lotes y stock negativo son excluyentes en un almacén (recomendado).
- **D6:** un código de proveedor es único por empresa + proveedor; puede repetirse entre
  proveedores distintos (recomendado).
- **D7:** sí, módulo mínimo de Proveedores en este sprint (recomendado).
- **D8:** una factura puede juntar compras de varias tiendas de la empresa, solo para admins; un
  usuario ligado a una tienda junta solo las de su tienda (recomendado).
- **D9:** proveedor, serie-número, fecha de emisión, moneda y total en la factura, opcionales al
  inicio (recomendado).
- **D10:** modos Lineal y Libre; el Personalizado queda para después (recomendado).
- **D11:** flujo de producción configurado por empresa (recomendado).
- **D12:** correo con Brevo (recomendado).
- **D14:** "Maneja stock" apagado en los productos existentes (se activa en bloque) y encendido por
  defecto en los nuevos (recomendado).
- **D15:** la base del sprint es una copia de `grulla_dev` (recomendado).
- **D16:** aprobadas todas las librerías de la sección 12. Además, el usuario pidió dejar todo lo
  de SUNAT para el final del sprint, con cuidado para no caer en multas.
- **D17:** los módulos extra de la sección 10 no entran.
- **D18:** vista de la cotización para el cliente, sin login, para mandarla por WhatsApp.
  - Lleva un interruptor por cotización, encendido por defecto, que al apagarse deja de mostrarla.
  - Se suma el envío por correo; elegí enlace + PDF adjunto.
  - **Confirmado por el usuario:** el enlace lleva un código aleatorio para que nadie vea
    cotizaciones ajenas cambiando el número; el cliente no inicia sesión ni escribe nada. El
    interruptor es de la cotización, no de facturas.
  - **Pedido del usuario:** avisar a los Super Administradores cuando se agote el cupo diario de
    correos (sección 5.2).
  - **Fix agregado:** los campos que se descuadran en Nueva cotización (ítem 8, sección 5c).
- **D19:** el ítem 3 (vincular varias compras a una factura) sí va, al final del sprint y antes de
  la GRE. La facturación electrónica SUNAT no va ("nada de la SUNAT todavía").
- **D20:** la guía de remisión sigue al final del sprint, como estaba: primero el modo manual y
  después la emisión directa a SUNAT.

---

## 12. Librerías nuevas (aprobadas el 12-nov-2026, D16)

Al instalar cada una se anota en CLAUDE.md como aprobada, con su versión fijada (igual que
`@dnd-kit` y Recharts).

| Librería | Para qué | Ítem |
|---|---|---|
| SheetJS CE 0.20.x (CDN oficial) | Leer Excel y CSV de proveedores; exportar listados | 6, 2 |
| `xml-crypto` | Firma XMLDSig de la GRE | 1 (opción A) |
| `node-forge` | Leer el certificado `.pfx` | 1 (opción A) |
| `fflate` | Comprimir y descomprimir el zip del envío y del CDR | 1 (opción A) |
| `qrcode` | QR en el PDF de la GRE | 1 |

No hacen falta librerías para el correo (se usa `fetch`) ni para el límite de intentos (middleware
propio). En el frontend no hacen falta librerías nuevas: el reordenamiento de columnas usa
`@dnd-kit/core`, que ya está.

---

## 13. Orden de ejecución y definición de "terminado"

| Fase | Contenido | Notas |
|---|---|---|
| 0 | Entorno del sprint (worktrees, base `grulla_s2_dev`, puertos), cuenta de Brevo y dominio | Día 1 |
| 1 | Base común: `company_feature`, proveedores, series, job `tick`, cifrado, ubigeo y campos nuevos de producto, tienda y cliente | Habilita todo lo demás |
| 2 | Ítem 4: correo y contraseñas (cierra el riesgo de la sección 1) | Va primero por seguridad; puede salir a producción antes del fin del sprint |
| 3 | Ítem 7: compartir la cotización (vista pública, WhatsApp y correo) e ítem 8: fix del formulario | Usa el correo del ítem 4; pueden salir junto con él |
| 4 | Ítem 5: kanban | — |
| 4b | Ítem 9: mismos formularios de cliente y producto en Nueva cotización | Agregado el 13-nov |
| 5 | Ítem 6: stock de proveedores | Necesita los Excel |
| 6 | Ítem 2: almacenes (núcleo) | El bloque más grande; sin GRE todavía, la salida se genera al marcar Entregada |
| 7 | Ítem 3: compras sin factura | Al final, por decisión del usuario (D19) |
| 8 | Ítem 1: GRE. Primero el modo manual, después la prueba técnica con SUNAT y recién entonces la emisión directa | Al final, por decisión del usuario |
| 9 | QA integral, ensayo de las migraciones (`db:upgrade-production`) sobre una copia temporal de producción que se borra al terminar, y release | — |

**Si el sprint tiene fecha fija:** lo que pasa al Sprint 3 es lo último de la lista (la emisión
directa a SUNAT o partes avanzadas del almacén). Nunca la base común ni los fixes.

**Un bloque está terminado cuando:**
- tiene migraciones idempotentes con su `down`, seeders de módulos y recursos RBAC, menú y README
  del módulo;
- tiene pruebas jest de los servicios (alcance de empresa y tienda, concurrencia donde hay stock o
  numeración) y una prueba Playwright del flujo principal;
- `tsc --noEmit` pasa en los dos repos y `oxlint` no da errores;
- fue probado a mano en `grulla_s2_dev`;
- el README de cada módulo tocado está actualizado.

---

## 14. Lo que necesito de ti

1. **Al empezar el sprint:**
   - el dominio desde el que saldrán los correos y acceso a su DNS en Hostinger;
   - la cuenta de Brevo, cuya aprobación puede tardar.
2. **Antes de la fase 5:** los Excel de los proveedores y sus enlaces (ítem 6), idealmente 2 por
   proveedor, de días distintos.
3. **Antes de la fase 8 (GRE):** el usuario secundario, las credenciales API y el CDT, que se sacan
   en SOL como explica la sección 9.3.
   - **No por chat:** se cargan cifrados desde la pantalla de configuración del sistema.

---

## 15. Fuentes

**Guía de remisión (SUNAT):**
- [R.S. 000108-2026/SUNAT (texto oficial)](https://www.sunat.gob.pe/legislacion/superin/2026/000108-2026.pdf)
  · [nota de El Peruano](https://elperuano.pe/noticia/296997-sunat-actualiza-las-reglas-para-el-traslado-de-bienes-conozca-los-cambios)
  · [resumen de LLB Solutions](https://llbsolutions.com/es/guias-remision-electronicas-sunat-cambios-clave-2026/)
- [RSNATI 000031-2026 (no sanción)](https://www.sunat.gob.pe/legislacion/superAdjunta/rsnati/2026/rsnati-000031-2026.pdf)
  · [El Peruano](https://www.elperuano.pe/noticia/298940-sunat-prorroga-uso-de-facultad-de-no-sancionar-infracciones-sobre-emision-de-guias-de-remision-electronicas)
  · [Mifact: fechas de multas](https://mifact.net/sunat-prorroga-las-sanciones-por-guias-de-remision-electronicas-lo-que-tu-empresa-debe-saber/)
- [Datos obligatorios de la GRE 2026](https://facturacionperu.pe/guias-remision-electronicas/)
  · [Catálogo 20, Anexo I R.S. 000240-2024](https://www.sunat.gob.pe/legislacion/superin/2024/anexo1-000240-2024.pdf)
  · [Vehículos M1/L (Mifact)](https://mifact.net/como-emitir-una-guia-de-remision-electronica-en-sunat-2024/)
- [API REST de GRE (greenter/gre-api)](https://github.com/thegreenter/gre-api)
  · [Detalle de token, envío y ticket](https://facturaperu.com.pe/ia/programadores/guias-de-remision/integracion-api-rest-de-guias-de-remision-sunat/)
  · [Certificado Digital Tributario gratuito](https://cpe.sunat.gob.pe/certificado-digital-tributario)
- [Precio de referencia de PSE (Nubefact)](https://kom.pe/facturacion-electronica-woocommerce-proveedores/)
  · [Integración PSE Nubefact (Odoo)](https://apps.odoo.com/apps/modules/18.0/l10n_pe_edi_picking)

**Inventario y legal:**
- [Art. 35 del Reglamento LIR, Directiva 002-2000-SUNAT](https://www.sunat.gob.pe/legislacion/direc/2000/00200.htm)
  · [UIT 2026 = S/ 5 500](https://elperuano.pe/noticia/285208-mef-establece-en-s-5-500-la-unidad-impositiva-tributaria-para-2026)
- [Odoo: estrategias de salida (FEFO)](https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/warehouses_storage/removal_strategies.html)
  · [Odoo: vencimientos](https://www.odoo.com/documentation/master/applications/inventory_and_mrp/inventory/product_management/product_tracking/expiration_dates.html)
  · [ERPNext: lotes, sin negativo desde v15](https://docs.frappe.io/erpnext/batch)

**Correo y seguridad:**
- [Planes gratis de correo transaccional 2026](https://markrelay.com/research/free-transactional-email-api-plans-compared)
  · [Comparativa 2026](https://freetier.co/articles/free-email-sending-tiers-2026)
  · [Hostinger: puertos SMTP](https://www.hostinger.com/ph/tutorials/smtp-port-587)
- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
  · [OWASP SSRF (Top 10 A10)](https://owasp.org/Top10/2021/A10_2021-Server-Side_Request_Forgery_(SSRF)/index.html)
- [SheetJS: npm abandonado](https://www.Github.com/SheetJS/sheetjs/issues/2822)
  · [ExcelJS: aviso por archivos comprimidos](https://security.snyk.io/vuln/SNYK-JS-EXCELJS-19234025)

**Kanban:**
- [Jira: columnas y estados](https://support.atlassian.com/jira-service-management-cloud/docs/manage-board-columns-and-statuses/)
  · [Categorías de estado](https://www.techrepublic.com/article/custom-jira-worflows-managing-software/)

**Mercado:**
- [PromoStandards en commonsku](https://help.commonsku.com/knowledge/what-is-promostandards)
  · [Especificación Inventory 2.0](https://core-infra-resources.vercel.app/standards/inventory-2.0.0)
  · [Printavo: funciones](https://printavo.com/features)
- [Precios de la API de WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
  · [API de tipo de cambio del BCRP](https://estadisticas.bcrp.gob.pe/estadisticas/series/api/PD04640PD)

**Ventas y competencia (sección 10.1):**
- [Proposify: estadísticas de cierre 2026](https://www.proposify.com/blog/sales-closing-statistics)
  · [HBR 2011, The Short Life of Online Sales Leads](https://scholarsarchive.byu.edu/facpub/9711)
- [commonsku: presentaciones](https://commonsku.com:443/distributorfeatures/presentations)
  · [commonsku: Shops](https://commonsku.com/shops)
- [CotizzaPro](https://www.cotizzapro.com/crear-cotizaciones-online-peru)
  · [Facturación Electrónica Perú: precios](https://www.facturacionelectronica.pe/precios/)
  · [Mifact](https://mifact.net/) · [Simple](https://simple.pe/)
- [WhatsApp Business en Perú (Andina)](https://andina.pe/agencia/noticia-whatsapp-business-acelera-atencion-las-empresas-peru-1038733.aspx)
  · [Compartir archivos con Web Share (web.dev)](https://web.dev/patterns/files/share-files)
  · [Enlaces wa.me (guía)](https://u2l.ai/blog/whatsapp-click-to-chat-link)
