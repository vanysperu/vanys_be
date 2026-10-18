# Módulo: quotation (Cotizaciones)

## Código de módulo (RBAC)
`cotizacion`

## Endpoints
| Método | Ruta                             | Acción                     | Requiere módulo |
|--------|----------------------------------|----------------------------|-----------------|
| GET    | /quotation/list                  | list (pag)                 | cotizacion      |
| GET    | /quotation/find/:id              | detail                     | cotizacion      |
| GET    | /quotation/:id/pdf               | PDF                        | cotizacion      |
| POST   | /quotation/create                | create                     | cotizacion      |
| PUT    | /quotation/update/:id            | update                     | cotizacion      |
| PUT    | /quotation/status/:id            | cambiar estado             | cotizacion      |
| PUT    | /quotation/item/:itemId/stage    | mover etapa de producción  | cotizacion      |
| POST   | /quotation/:id/payments          | registrar pago             | cotizacion      |
| POST   | /quotation/:id/expenses          | registrar gasto            | cotizacion      |
| POST   | /internal/jobs/expire-quotations | vencer cotizaciones (cron) | — (ver abajo)   |

`/internal/jobs/expire-quotations` no lo usa ningún usuario: lo llama cada
hora el cron del hosting y se autentica con el secreto compartido
`CRON_SECRET` en la cabecera `X-Cron-Secret` (no con sesión ni RBAC). Si
`CRON_SECRET` no está configurado, el endpoint queda apagado (404), nunca
abierto. Existe porque en el hosting la app se apaga sola sin tráfico, y el
`setInterval` interno no alcanza.

## Reglas de negocio propias del módulo

### Alcance y referencias
- `company_id` sale siempre de la sesión. Además, **todo lo que la
  cotización referencia se valida contra esa empresa** (cliente, tienda,
  producto, técnica): validar solo el dueño de la cotización protegía el
  encabezado pero no sus referencias (`TenantMismatchError`).
- **El catálogo deshabilitado no se puede usar en cotizaciones nuevas**
  (`DisabledCatalogEntityError`): un cliente/producto/técnica con
  `is_deleted = true` significa "ya no se usa", pero la API lo seguía
  aceptando aunque el formulario no lo ofreciera. Las cotizaciones **ya
  existentes** que lo referencian no se tocan: se siguen viendo completas.
- `update` usa una **lista blanca explícita** de campos editables. Antes
  hacía spread del body, así que se podía reasignar `company_id`,
  `client_id`, `status` o `total` por fuera de sus flujos.

### Estados
- Cadena principal + transiciones de salida; `rejected`, `expired`,
  `cancelled` y **`finished`** son terminales. Que `finished` no estuviera
  en esa lista permitía revertir una cotización ya cerrada y cobrada hasta
  `cancelled`.
- **No se puede rechazar ni cancelar una cotización con dinero de por
  medio** (`QuotationHasMoneyInvolvedError`): si ya tiene pagos registrados
  o compras reales hechas contra ella, el dinero quedaría colgado en una
  cotización cerrada sin ningún aviso.

### Dinero
- Los importes se **redondean a 2 decimales en el service** (`roundMoney`),
  que es la precisión real de las columnas `DECIMAL(10,2)`. El precio
  unitario se redondea *antes* de multiplicar para que
  `precio unitario × cantidad = subtotal` cuadre exactamente con lo que ve
  el cliente en el PDF.
- `total_paid` se recalcula con una **sentencia SQL atómica**
  (`UPDATE ... SET total_paid = (SELECT SUM ...)`), nunca leyendo y
  escribiendo en dos pasos: dos pagos concurrentes sobre la misma
  cotización se pisaban (lost update) y el total quedaba desincronizado.
- **No se admite sobre-pago**: crear o editar un pago valida el saldo
  pendiente tomando un lock sobre la cotización
  (`assertPaymentWithinBalance`), con una tolerancia de S/ 0.01 por
  redondeo.
- El subtotal es siempre `precio_por_unidad × cantidad`. Los 4 precios de
  catálogo (unidad/ciento/medio millar/millar) son **tarifas por volumen**,
  no precios de un lote cerrado.
- El precio por unidad de un item es **precio del producto + precio de la
  técnica en la MISMA escala** (ver
  [`customization_technique`](../customization_technique/README.md)): jabón
  ciento 0.90 + serigrafía ciento 0.95, 10 unidades = 18.50. Si el producto o
  la técnica no tienen precio en esa escala, se rechaza la cotización.
- **Adelanto al aceptar** (pedido explícito del usuario): `PUT /quotation/status/:id`
  acepta un `advance_payment` opcional (mismos campos que un pago) SOLO cuando
  `status = "accepted"`. El cambio de estado y el pago van en la MISMA
  transacción: si el pago falla (sobre-pago, cuenta inválida), la cotización
  no queda aceptada. Exige además el permiso de registrar pagos
  (`POST /quotation/*/payments`). En el frontend, al pasar de Pendiente a
  Aceptada (botón o arrastre en el Kanban) aparece el modal "¿El cliente pagó
  adelanto?" con la mitad del total sugerida.
- Un pago que no es en efectivo exige `payment_account_id` (cuenta de la
  empresa a la que entró el dinero) cuando la empresa tiene cuentas activas
  (`resolvePaymentAccountForQuotation`); la cuenta se valida contra la
  empresa de la cotización.
- Filtros de `list`: `status`, `clientId`, `createdBy`, `businessUnitId`
  (solo si el usuario no está atado a una tienda), `dateFrom`/`dateTo`
  (fecha de emisión, hora de Lima).
- El IGV no es constante: sale de una Variable General por empresa
  (`getIgvRate`).

### Consistencia
- Crear una cotización escribe cabecera + items + evento de timeline en
  **una sola transacción**. El evento `created` iba después del commit, así
  que un fallo ahí dejaba la cotización sin timeline, sin forma de
  repararlo salvo tocando la BD a mano.
- `valid_until` se calcula solo a partir de la configuración de la empresa
  si no viene en el body (antes quedaba `null` y la cotización no vencía
  nunca). Se cuenta desde el día de emisión **en Lima**: antes se usaba el
  día UTC, y una cotización emitida después de las 7 p. m. quedaba vigente
  un día de más.

### Fechas y vencimiento
- Todo lo que depende del "día calendario" se resuelve en America/Lima
  (`utils/dateUtils.ts`), sin importar la zona del servidor. El proceso
  además fija `TZ=America/Lima` al arrancar (`config/bootstrap.ts`).
- "Válida hasta el 22" significa vigente todo el 22 en Lima. El job la vence
  recién cuando en Lima ya es 23. Antes comparaba contra un `Date` y, en un
  servidor en UTC, vencía a las 7 p. m. de Lima.
- El job vuelve a exigir `status = "pending"` en el UPDATE: antes, si un
  usuario aprobaba la cotización entre la lectura y la escritura del job,
  este la pisaba a "Vencida". Cada vencimiento y su evento de timeline van
  en una transacción.
- El PDF formatea `valid_until` (DATEONLY) como texto, sin pasar por un
  `Date` local. Antes salía **un día antes** de lo guardado.

## Campos especiales
- `billing_name` / `billing_document_number`: solo afectan lo que se
  imprime en el PDF — `client_id` sigue siendo el cliente real vinculado.
- `includes_delivery` / `includes_design` son informativos;
  `includes_igv` sí afecta el cálculo del total.
