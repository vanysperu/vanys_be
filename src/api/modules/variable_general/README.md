# Módulo: variable_general

## Código de módulo (RBAC)
`variable_general`

## Endpoints
| Método | Ruta                          | Acción         | Requiere módulo   |
|--------|-------------------------------|----------------|-------------------|
| GET    | /variable_general/list        | list (pag)     | variable_general  |
| GET    | /variable_general/detail/:id  | getById        | variable_general  |
| POST   | /variable_general/create      | create         | variable_general  |
| PUT    | /variable_general/update/:id  | update         | variable_general  |
| PUT    | /variable_general/disable/:id | disable        | variable_general  |
| DELETE | /variable_general/delete/:id  | delete (legacy)| variable_general  |

## Vistas de frontend vinculadas
- variable_general.list (`/configuracion/variables-generales`)

## Botones/acciones vinculadas
- variable_general.create.button
- variable_general.update.button
- variable_general.disable.button
- variable_general.delete.button (legacy, ver "Notas" abajo)

## Reglas de negocio propias del módulo
- **Cuentas de pago** (`category = "payment_account"`): una cuenta con
  movimientos (pagos, gastos, caja, reposiciones) **no se elimina** (409
  `PAYMENT_ACCOUNT_IN_USE`) ni cambia de categoría: antes, borrarla pasaba su
  historial a "Efectivo" y Caja dejaba de cuadrar. Se **deshabilita**: deja
  de ofrecerse en los selectores y su historial se conserva. La base también
  lo impide (llaves `RESTRICT`).
- **Número de Yape y Plin** (reporte de QA): 9 dígitos que empiezan con 9
  (`400 INVALID_PAYMENT_ACCOUNT_NUMBER`). Se valida al crear y solo cuando
  cambia el tipo o el número: una cuenta vieja con un número inválido se sigue
  pudiendo marcar, renombrar, cambiarle el QR y usar en pagos. Una cuenta
  bancaria no tiene formato fijo.
- **Cuentas internas** (`show_in_quotation = false`, pedido explícito del
  usuario: "hay cuentas internas y externas"): no salen en el PDF de la
  cotización, pero se siguen usando para registrar pagos, gastos y Caja. Por
  defecto `true`. Se marca en Documentos de la empresa. Solo aplica a cuentas de
  pago.
- **QR de una cuenta de pago** (`ref2` = ruta de `company_asset`): al crear o
  cambiar `ref2`, la imagen tiene que ser de la misma empresa y existir
  (`400` si no). Al cambiarlo, quitarlo (`ref2: null`) o eliminar la cuenta, la
  imagen anterior se borra en la misma transacción. Deshabilitar no la borra. Ver
  `uploads/README.md`.
- `company_id = NULL` significa variable **global**, visible para todas las
  empresas (ej. tipos de documento, métodos de pago). Las etapas de producción
  ya no viven acá: desde el Sprint 2 son columnas del flujo de cada empresa
  (`production_workflow/README.md`); las filas `production_stage` quedaron dadas
  de baja por la migración `20261113120000`. **Solo el Super Administrador (`is_system`) las ve en la pantalla
  de gestión y las crea/edita/deshabilita/elimina.** Un Administrador de
  empresa conserva la pantalla pero ahí gestiona únicamente las filas de SU
  empresa; al crear, `company_id` siempre queda forzado a la suya (se ignora
  lo que mande el body) y el update nunca modifica `company_id`.
- **Parámetro `scope=manage`** (`GET /variable_general/list`, solo valor
  permitido `manage`): modo de la pantalla de gestión. Para un usuario no
  `is_system` filtra `company_id = <suya>` estrictamente (sin filas globales);
  para `is_system` no cambia nada. **Sin `scope`** el listado sigue incluyendo
  las globales, porque los selectores de otras pantallas (Caja, Pagos, cuentas
  de pago, documentos, deudas) las necesitan; solo
  `VariableGeneralPage` envía `scope=manage`.
- **403 `GLOBAL_VARIABLE_FORBIDDEN`**: un usuario no `is_system` que pide
  detalle (`GET /detail/:id`), edita, deshabilita o elimina una fila global
  recibe 403 con ese `code`. Una fila inexistente o de otra empresa sigue
  siendo "no encontrada" (404 / `null`), sin revelar que existe.
  Implementado en `services/shared/variable_scope.service.ts`
  (`loadManageableVariable`).
- **Categorías de productos** (`category = "product_category"`) y
  **subcategorías** (`"product_subcategory"`, con `ref1` = id de su categoría):
  al crear o editar una subcategoría, `ref1` tiene que ser una categoría
  activa del mismo ámbito (una global cuelga de una global; una de empresa, de
  una global o de una de SU empresa); si no, `400`. La pantalla elige la
  categoría padre con un selector. Ver `product/README.md`.
- **Sin nombres repetidos** (pedido explícito del usuario: se veían duplicadas
  en el selector del producto). Entre filas ACTIVAS, sin distinguir mayúsculas
  ni espacios de los extremos (`409 DUPLICATE_PRODUCT_CATEGORY`):
  - una categoría de empresa no repite el nombre de otra de su empresa ni de
    una global; una global no repite el de otra global ni el de una categoría
    de cualquier empresa (esa empresa la vería dos veces);
  - una subcategoría no se repite dentro de su categoría.
  - Se valida al crear, al editar y **al rehabilitar** (deshabilitar siempre se
    puede). `shared/product_category.service.ts` → `assertUniqueProductCategoryName`.
- **Zonas de anuncios** (`category = "advertisement_zone"`): lugares de la web
  donde salen los anuncios (ver `advertisement/README.md`). `prefix_id` es el
  código que manda la web (`?zone=inicio`) y no se repite entre las zonas
  activas que ve una empresa (las suyas y las globales) → `409
  DUPLICATE_ADVERTISEMENT_ZONE`. Se valida al crear, editar y rehabilitar
  (`shared/advertisement_zone.service.ts`). Deshabilitar una zona apaga sus
  anuncios en la web.
- El listado en modo "select" (`admin=false`) solo devuelve `{value, name}`
  para alimentar `<select>` de otros formularios (no pagina igual que la
  pantalla de administración).
- Deshabilitar es un **toggle** (`is_deleted`): el mismo endpoint habilita o
  deshabilita según el estado actual, igual que en `client`/`product`.

## Campos especiales
- Auditoría (`created_by`, `created_at`, `updated_by`, `updated_at`) y
  soft-delete (`is_deleted`) fueron agregados en la migración
  `20260922100000-add-audit-and-soft-delete-general-variable.js` — la tabla
  original (`general_variable`) no los tenía.

## Notas
- El endpoint `DELETE /variable_general/delete/:id` (borrado físico) es
  **legacy**: el frontend (`VariableGeneralPage.tsx`) ya no lo usa, fue
  reemplazado por `PUT /variable_general/disable/:id` (soft-delete vía
  `ToggleStatusButton`), conforme a CLAUDE.md sección 1 ("disable es SIEMPRE
  soft-delete, no existe acción delete física por defecto"). El endpoint
  físico se dejó en el backend sin remover para no romper compatibilidad
  con integraciones externas que pudieran depender de él; se recomienda
  removerlo en un cambio futuro explícito una vez confirmado que nada más
  lo usa.
