# Módulo: dispatch_guide (Guías de remisión)

Sprint 2, ítem 1 (plan §9). Guía de remisión electrónica **remitente**, por ahora en **modo
manual** (decisión D1, opción C): el sistema arma la guía, la persona la emite en SUNAT (SEE-SOL o
App Emprender) y registra acá su serie, número y PDF. **Nada se envía a SUNAT** desde este módulo
todavía; la emisión directa llega después de la prueba técnica (plan §9.3).

Además del rol, la empresa necesita la funcionalidad `dispatch_guide` (Empresas → Funcionalidades,
la prende el Super Administrador). Sin ella todo el módulo responde `403 FEATURE_DISABLED`.

## Código de módulo (RBAC)
`dispatch_guide` (seeder `20261116100100-seed-dispatch-guide-module.js`, recursos 320–341).
- Operar (ver, armar y editar borradores, registrar la guía emitida, subir/descargar el PDF,
  descartar un borrador, precargar, elegir transportista/vehículo/conductor): quien ve
  cotizaciones (`cotizacion.list`), Gestor incluido; su alcance queda en su tienda.
- Configurar vehículos y conductores y anular una guía registrada: los roles administradores
  (`producto.create.button`). Nunca el Gestor (CLAUDE.md §11.1).

## Endpoints
| Método | Ruta | Acción | Recurso |
|--------|------|--------|---------|
| GET  | /dispatch-guide/guides | listar (pag; `searchTerm`, `status`, `quotationId`, `dateFrom`/`dateTo`) | `dispatch_guide.list.endpoint` |
| GET  | /dispatch-guide/guides/:id | detalle | `dispatch_guide.find.endpoint` |
| GET  | /dispatch-guide/prefill?quotationId= \| transferId= | precarga | `dispatch_guide.prefill.endpoint` |
| POST | /dispatch-guide/guides | crear borrador (201) | `dispatch_guide.create.button` |
| PUT  | /dispatch-guide/guides/:id | editar borrador | `dispatch_guide.update.button` |
| POST | /dispatch-guide/guides/:id/register | registrar la guía emitida (serie, número, fecha; multipart con `file` opcional) | `dispatch_guide.register.button` |
| POST | /dispatch-guide/guides/:id/file | subir/reemplazar el PDF (o foto) | `dispatch_guide.uploadFile.button` |
| GET  | /dispatch-guide/guides/:id/file | descargar el PDF (privado) | `dispatch_guide.downloadFile.button` |
| POST | /dispatch-guide/guides/:id/discard | descartar borrador | `dispatch_guide.discard.button` |
| POST | /dispatch-guide/guides/:id/void | anular guía registrada (`reason`) | `dispatch_guide.void.button` |
| GET  | /dispatch-guide/carriers | transportistas (proveedores marcados) | `dispatch_guide.carriers.endpoint` |
| GET/POST | /dispatch-guide/vehicles | listar / crear (201) | `dispatch_guide.vehicles.*` |
| PUT  | /dispatch-guide/vehicles/:id(/disable) | editar / deshabilitar-habilitar | `dispatch_guide.vehicles.*` |
| GET/POST | /dispatch-guide/drivers | listar / crear (201) | `dispatch_guide.drivers.*` |
| PUT  | /dispatch-guide/drivers/:id(/disable) | editar / deshabilitar-habilitar | `dispatch_guide.drivers.*` |

## Ubigeo (distrito) sin buscar el código
SUNAT pide el ubigeo (6 dígitos) del punto de partida y del de llegada. En el formulario se elige
el **distrito por nombre** (escribiendo unas letras; busca también por provincia o por código) y el
sistema guarda el código. Si la dirección ya trae el distrito ("Av. Larco 345, San Isidro") se
rellena solo, con la nota "Detectado de la dirección, verifícalo". Ante la duda (nombre repetido en
varias provincias, p. ej. Miraflores o San Miguel) **no** rellena: ofrece las opciones, el distrito
más grande primero. La tabla es la oficial del INEI 2025 (1 891 distritos) y vive en el frontend
(`grulla_fe/src/lib/ubigeo`): las direcciones no salen del sistema. El backend sigue validando solo
el formato (6 dígitos) al guardar y al registrar la guía.

## Vistas de frontend vinculadas
- `dispatch_guide.guides.view` → `/logistica/guias`
- `dispatch_guide.vehicles.view` → `/logistica/vehiculos`
- `dispatch_guide.drivers.view` → `/logistica/conductores`

## Botones/acciones vinculadas
- `dispatch_guide.create.button`, `update.button`, `register.button`, `uploadFile.button`,
  `downloadFile.button`, `discard.button`, `void.button`
- `dispatch_guide.vehicles.create/update/disable.button`, `dispatch_guide.drivers.create/update/disable.button`

## Reglas de negocio propias del módulo
- **Estados (modo manual):** `draft` (borrador) → `manual` (registrada con el número que dio
  SUNAT) → `voided` (anulada). Un borrador se descarta (queda `voided`, "Borrador descartado"):
  nunca se borra la fila. Una guía registrada ya no se edita: se anula y se arma otra.
- **Origen:** una cotización **Lista o Entregada** (`409 QUOTATION_NOT_READY` si no), una
  transferencia de almacén (motivo 04; a lo sumo una guía no anulada por transferencia,
  `409 TRANSFER_HAS_GUIDE`) o de cero. Empresa y tienda salen de la cotización, la transferencia o
  la sesión, nunca del body.
- **Entregas parciales:** una cotización puede tener varias guías. Entre todas las no anuladas
  (borradores incluidos) no pueden llevar más de lo pedido por producto y color
  (`409 DISPATCH_EXCEEDS_PENDING`, con el detalle por línea). La cotización se bloquea
  (`FOR UPDATE`) al crear, editar y registrar, así que dos guías a la vez no se pasan.
- **Registrar = datos completos:** al registrar se exige lo que pide SUNAT (plan §9.2) y se
  responden TODOS los faltantes juntos (`400 GUIDE_INCOMPLETE`, `errors.missing`): inicio del
  traslado, destinatario, direcciones y ubigeos, peso bruto, al menos un bien; en motivo 04 los
  códigos de establecimiento; en motivo 13 la descripción; transporte público → RUC y razón social
  del transportista; privado → vehículo y conductor, salvo vehículo liviano M1/L.
- **Número único por empresa:** serie `T###` + número (`409 GUIDE_NUMBER_TAKEN`). Lo garantiza un
  índice único: dos registros simultáneos del mismo número dejan uno solo.
- **Salida de almacén (D4):** una guía de venta (01, 03, 14) de una cotización descuenta el stock
  al registrarse si la tienda eligió "al emitir la guía" (Inventario → Tiendas). Sale del almacén
  de partida (o del predeterminado de la tienda). Si no alcanza, la salida queda en borrador y se
  avisa en la campana (igual que al marcar Entregada). Anular la guía anula esa salida en la misma
  transacción y lo despachado vuelve a quedar pendiente.
- **Baja en SUNAT:** anular acá NO da de baja la guía en SUNAT; eso se hace en SOL.
- **Historial de la cotización:** eventos `dispatch_guide_registered` y `dispatch_guide_voided`.

## Campos especiales
- El PDF va en la base (`dispatch_guide_file`, LONGBLOB) y no en disco: Hostinger borra el disco
  en cada despliegue. PDF o foto, máx. 5 MB, se valida la firma real del archivo; nunca tiene URL
  pública.
- `dispatch_guide_transport` copia los datos del vehículo/conductor al momento de la guía: si el
  catálogo cambia después, la guía sigue diciendo lo que se declaró.
- `company_sunat_settings` por ahora solo guarda `emission_mode` (manual); las credenciales SOL y
  el certificado llegan con la emisión directa, cifrados y nunca devueltos.
- Placas en mayúsculas y sin guiones (`ABC-123` = `ABC123`), únicas por empresa.
- Fechas de auditoría como `{ date, time }` (Lima); `issue_date` y `transfer_start_date` son
  `YYYY-MM-DD`.
