# Sprint 2 — Cómo retomar en otra PC

> Guía para seguir el Sprint 2 desde otra computadora (con Claude Code o a mano).
> Estado al 13-nov-2026. Lo hecho y lo pendiente, con cada commit, está en
> [PROGRESO.md](PROGRESO.md); el plan completo y las decisiones (D1–D20), en
> [PLAN-SPRINT-2.md](PLAN-SPRINT-2.md).

## 1. Código

Las dos ramas están en GitHub, en `feature/sprint-2`:

```bash
git clone https://github.com/vanysperu/vanys_be.git grulla_be
git clone https://github.com/vanysperu/vanys_fe.git grulla_fe
cd grulla_be && git checkout feature/sprint-2 && npm install
cd ../grulla_fe && git checkout feature/sprint-2 && npm install
```

- Estructura esperada: una carpeta del proyecto con `grulla_be/`, `grulla_fe/` y el
  `CLAUDE.md` del proyecto al lado (copiar `docs/sprint-2/CLAUDE.md` de este repo a esa carpeta:
  son las reglas del proyecto que Claude Code lee solo).
- `grulla_be` usa SheetJS desde su CDN oficial (`xlsx` 0.20.3 en `package.json`): `npm install`
  lo baja de `cdn.sheetjs.com`.

## 2. Base de datos

**Opción rápida (recomendada):** el paquete `sesion-claude-sprint2.zip` que se llevó por USB/Drive
(no está en GitHub porque tiene datos y claves) trae `base\grulla_s2_dev.sql` —la base del sprint
completa, probada importándola en una base nueva— y `base\importar-base.ps1`, que la crea con
utf8mb4 sin pisar ninguna base existente. Esa copia ya tiene aplicadas todas las migraciones y
seeders del sprint. Trae también los `.env` (`config-local\`): **conservar `SECRET_HIDDEN_KEY` y
`GOOGLE_DRIVE_TOKEN_KEY`**, porque con ellas se cifraron datos de esa base.

**Opción desde cero:**

1. MySQL 8. Crear una base para el sprint copiando la de desarrollo (en la PC original:
   `grulla_s2_dev`, copia de `grulla_dev` con `mysqldump --single-transaction`).
2. En `grulla_be/.env`: `PROY_BD=<esa base>` (y el usuario/clave de MySQL).
3. Desde `grulla_be`:
   - `npx sequelize-cli db:migrate` (aplica las migraciones del sprint, `20261113*` y `20261114*`).
   - Seeders del sprint, en este orden (`npx sequelize-cli db:seed --seed <archivo>`):
     1. `20261113100100-seed-user-password-link-resource.js`
     2. `20261113110100-seed-quotation-share-resources.js`
     3. `20261113120100-seed-production-workflow-module.js`
     4. `20261114100100-seed-supplier-module.js`
     5. `20261114110200-seed-supplier-stock-module.js`
     6. `20261114120100-seed-inventory-module.js`
   - En producción no se corre nada a mano: `npm run db:upgrade-production` aplica solo las
     migraciones y seeders pendientes (ver el script).
4. Cuentas QA para las pruebas: `npm run db:seed-qa` (Super Administrador
   `qa.superadmin@grulla.test`, admin `admin.qa@acme.test`, clave `Test1234`).

## 3. Variables nuevas del `.env` (backend)

Ver `.env.example`. Las del sprint:

| Variable | Para qué |
|---|---|
| `APP_PUBLIC_URL` | URL del frontend: arma los enlaces de los correos y de la cotización pública |
| `EMAIL_PROVIDER` (`brevo` / `log`) | Envío de correos; sin configurar, `log` en desarrollo |
| `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `EMAIL_DAILY_LIMIT` | Brevo (pendiente: dominio y cuenta del usuario) |
| `APP_ENCRYPTION_KEY` | Cifrado de datos sensibles (si falta se deriva de `SECRET_HIDDEN_KEY`; en producción NO cambiar la que ya está) |
| `CRON_SECRET` | Lo pide `POST /api/internal/jobs/tick` (cron de hPanel cada 10 min: correos, vencer cotizaciones, Drive, stock de proveedores, lotes por vencer) |

## 4. Puertos y pruebas (como se trabajó)

- Backend del sprint en **4760** (`PROY_APP_PORT=4760`), frontend en **4260**
  (`npm run dev -- --port 4260`, `.env` del frontend: `VITE_API_URL=http://localhost:4760/api`).
  Antes de levantar, revisar que el puerto no lo use otro proyecto (CLAUDE.md §0).
- El backend se levantaba con `npx ts-node ./src/index.ts` (sin nodemon): **después de cambiar el
  backend hay que reiniciarlo**, si no las pruebas corren contra el código viejo.
- jest: `API_BASE_URL=http://localhost:4760 npx jest tests/<suite>.test.ts --runInBand`
  (nunca dos corridas de jest a la vez contra la misma base).
- e2e: `E2E_PORT=4260 E2E_API_URL=http://localhost:4760/api npx playwright test <spec>`.
- Suites nuevas del sprint: `password-links`, `quotation-share`, `production-workflow`, `supplier`,
  `supplier-stock`, `supplier-stock-parsing` (unitaria), `inventory`; e2e `password-links`,
  `quotation-share`, `quotation-form-fields`, `production-workflow`, `suppliers`, `supplier-stock`,
  `inventory`.

## 5. Dónde quedó

Terminados: ítems 4 (correo y contraseñas), 7 (compartir cotización), 8 (formulario alineado),
5 (kanban configurable), 9 (mismos formularios en Nueva cotización), base común (funcionalidades
por empresa y Proveedores, D6) y 6 (stock de proveedores, con datos de prueba) y 2 (almacenes e
inventario).

Sigue, en este orden: **ítem 3** (compras sin factura: vincular varias compras a una factura después;
nada de SUNAT) y al final **ítem 1** (guía de remisión: modo manual primero, después la prueba con
SUNAT con traslados reales, después la emisión directa). Luego QA y release.

Pendiente del usuario: dominio + cuenta de Brevo; los Excel reales de las importadoras (para las
reglas propias de cada una en `supplier_stock/services/shared/stock_parsing.ts`); credenciales SOL y
CDT antes de la GRE (se cargan cifradas desde la pantalla, nunca por chat).

## 6. Trampas conocidas (no se deducen del código)

- **Una sesión por usuario**: cada login cierra la sesión anterior del mismo usuario. Las pruebas
  usan empresas desechables (`createCashClosingTestCompany` / `createDisposableCashCompany`) y el
  Super Administrador QA, para no cerrar la sesión de quien está usando el sistema.
- `/company/create` y `/business-unit/create` responden **201**.
- La empresa QA tiene más de 100 usuarios: los selectores cargan 100 y "Ana Acme" ya no aparece en
  "Asignado a" (fallan `employee-debts`, `requested-changes` y una de `quotations` por datos, no por
  el sprint).
- **Radix `Select` dentro de un formulario** dispara `onValueChange("")` al montar una fila nueva:
  todo `onValueChange` que escribe en el formulario empieza con `if (!value) return;`.
- **Un formulario dentro de un diálogo abierto sobre otro formulario** también enviaba el de atrás
  (React propaga el submit aunque el diálogo esté en un portal): los formularios compartidos
  llaman `event.stopPropagation()` antes de `handleSubmit`.
- MySQL no deja una FK con `ON DELETE SET NULL` sobre la base de una columna generada
  (`product_code.supplier_key`): esa FK es `RESTRICT`.
- Los archivos del repo usan CRLF: los reemplazos de varias líneas se hicieron con scripts de Node
  que respetan el fin de línea.

## 7. La conversación con Claude

El historial completo de esta sesión de Claude Code quedó en la PC original (no se sube a GitHub
porque trae datos internos):
`C:\Users\dev-d\.claude\projects\c--Extensiones-vn\c7bae267-db73-4f21-82f0-9a16cb267e5a.jsonl`.
Para seguir con el mismo contexto en otra PC, basta con este documento, `PROGRESO.md` y el plan:
pedirle a Claude Code que los lea antes de continuar.
