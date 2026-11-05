# Módulo: web_quote_request (Pedidos de cotización desde la web)

Pedido explícito del usuario: que desde la web de la empresa el cliente elija
productos (por código o SKU) y cantidades, y que eso llegue al sistema como una
cotización **"Pendiente de cotizar"** (`quote_requested`). El equipo la
completa (técnica, modo de precio, productos que falten) y la pasa a
**Pendiente**; desde ahí sigue el flujo normal.

## Código de módulo (RBAC)
No aplica: el endpoint no lo usa un usuario con sesión sino una integración.
Se protege con **API key por empresa** (`requireApiKey`, ver abajo), no con
token (vence) ni con `authorize`. La parte que sí hace un usuario (completar
la cotización) está en el módulo `cotizacion` — ver
[`quotation/README.md`](../quotation/README.md).

## Endpoints
| Método | Ruta                            | Acción                 | Protección            |
|--------|---------------------------------|------------------------|-----------------------|
| POST   | /api/public/quotation-request   | crear pedido de la web | API key (`X-Api-Key`) |

### Request
```http
POST /api/public/quotation-request
X-Api-Key: vnk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "client": {
    "phone": "987654321",          // OBLIGATORIO. Acepta "+51 987 654 321", "987-654-321"…
    "name": "Lucía Pérez",          // opcional (solo letras)
    "email": "lucia@correo.com",    // opcional
    "document_type": "1",           // opcional, va junto con document_number (1 DNI, 2 PAS, 3 CE, 6 RUC)
    "document_number": "12345678",  // opcional
    "address": "Av. Siempre Viva 123" // opcional
  },
  "items": [
    { "code": "E6000-01", "quantity": 100 },            // el código dice producto y color
    { "code": "E6000-05", "quantity": 200 },
    { "code": "MT013", "color": "Azul", "quantity": 50 }, // un código para todos los colores
    { "sku": "TAZA-01", "quantity": 120 }                 // sigue funcionando solo con SKU
  ]
}
```
- `items`: de 1 a 50. Cada uno necesita `code` (hasta 60 caracteres) o `sku`
  (hasta 50); `color` es opcional (hasta 60); `quantity` entero 1–1 000 000.
- **El código basta**: es único en la empresa (índice
  `uq_product_code_company_code`) y, si está vinculado a un color, ya dice
  producto y color. SKU, código y color se comparan sin distinguir mayúsculas.
- Las líneas se suman solo si son el mismo producto, código y color: 100 negros
  y 200 azules son **dos items**.
- **No se manda empresa ni tienda**: salen de la API key.

### Response `201`
```json
{
  "success": true,
  "message": "Pedido recibido. Algunos productos no existen y el equipo fue notificado",
  "data": {
    "quotation_id": 2679,
    "status": "quote_requested",
    "client_id": 2909,
    "client_created": true,
    "items_added": [{ "sku": "LAP-0034", "code": "E6000-01", "color": "Negro", "product_id": 99, "product_name": "Lapicero", "quantity": 100 }],
    "missing_items": [{ "sku": null, "code": "E9999", "quantity": 50 }],
    "warnings": []
  }
}
```
### Errores
| HTTP | `code`             | Cuándo |
|------|--------------------|--------|
| 401  | `INVALID_API_KEY`  | Falta la cabecera, la key no existe, está revocada, o su empresa/tienda está deshabilitada. |
| 400  | `VALIDATION_ERROR` | Body inválido (`message` dice qué campo; `errors` trae la lista completa). |

## Reglas de negocio
- **Cliente por celular**: se busca un cliente activo de la empresa con ese
  celular (se guarda solo con dígitos; el `+51` se quita). Si existe, se
  reutiliza **sin modificar sus datos**. Si no, se crea con lo que llegó; sin
  nombre queda como `Cliente web <celular>`. Si el email o documento ya los
  usa otro cliente de la empresa, el cliente nuevo se crea sin ese dato y se
  avisa en `warnings` (el pedido no se rechaza).
- **Color de cada item**: se guarda como texto en `quotation_item.product_code`
  y `quotation_item.color` (una copia: la cotización no cambia si se edita el
  catálogo). Lo que no se puede confirmar no frena el pedido (decisión del
  usuario): el producto entra, y se avisa en `warnings`, Recordatorios e
  Historial para que el equipo lo corrija al completar:
  - código de otro producto, junto con un SKU válido: se respeta el SKU, sin
    ese código;
  - código vinculado a un color distinto del `color` pedido: manda el código;
  - `color` que el producto no tiene: el item queda sin color.
- **SKU o código inexistente** (pedido explícito del usuario): no entra a la
  cotización; se crea un aviso en **Recordatorios** (campana + toast) para
  cada usuario activo de la empresa con acceso a Recordatorios: qué SKU, a
  qué cotización y cuántas unidades. Si la empresa no tiene a nadie con ese
  acceso, el aviso le llega a quien emitió la API key (antes se perdía). El
  Historial de la cotización registra los SKU y a cuántos usuarios se avisó.
  El equipo crea el producto y lo agrega al completar. Si
  faltan todos, la cotización se crea igual, sin items.
- **Precio sugerido (borrador)**: cada item toma la tarifa de catálogo de
  mayor volumen que alcanza la cantidad (≥1000 millar, ≥500 medio millar,
  ≥100 ciento, si no unidad); si el producto no tiene esa tarifa, la
  siguiente más chica que sí tenga. Sin técnica y con IGV activo por defecto
  (decisión del usuario): el equipo lo revisa al completarla.
- **Sin vigencia** mientras esté en "Pendiente de cotizar"
  (`valid_until = NULL`, el job de vencimiento no la toca). Se calcula al
  pasarla a Pendiente, contando desde ese día.
- `created_by` de cliente, cotización e items queda en `NULL` (no lo crea un
  usuario). Los avisos de Recordatorios exigen un autor: quedan a nombre de
  quien emitió la API key.
- No cuenta en Estadísticas mientras esté en "Pendiente de cotizar".
- Todo va en **una transacción**: cliente, cotización, items, historial y
  avisos quedan juntos o no queda nada.

## API keys (`api_key`)
- Una o más por empresa, opcionalmente atada a una tienda (las cotizaciones
  caen en esa tienda; sin tienda, quedan a nivel empresa y un usuario atado a
  una tienda sin "ver todas las tiendas" no las verá).
- Nunca se guarda la key: solo su SHA-256 (`key_hash`, único) y un prefijo
  (`key_prefix`) para reconocerla. Formato: `vnk_` + 43 caracteres.
- Va **siempre en la cabecera `X-Api-Key`**, nunca en la URL (queda en logs).
- **Llamar desde el servidor de la web, nunca desde el navegador**: una key en
  el JavaScript del sitio la puede copiar cualquiera. En producción el CORS
  ya bloquea orígenes que no estén en `CORS_ORIGINS`.
- `last_used_at` se actualiza como máximo una vez por hora.
- Gestión: pantalla **Configuración → API keys** (solo Super Administrador, ver
  [`api_key/README.md`](../api_key/README.md)). Respaldo por script desde `grulla_be/` (también
  viene en el paquete de producción):
  ```bash
  npm run api-key -- create --company <id> --name "Web principal" [--business-unit <id>] [--issued-by <userId>]
  npm run api-key -- list [--company <id>]
  npm run api-key -- revoke --id <apiKeyId> [--issued-by <userId>]
  ```
  La key se muestra **una sola vez** al crearla. Revocar es soft-delete
  (`is_deleted = true`): deja de funcionar al instante. `--issued-by` por
  defecto es el Super Administrador activo más antiguo.

## Vistas de frontend vinculadas
- Ninguna propia. La cotización aparece en `cotizacion.list` (primera columna
  del Kanban, "Pendiente de cotizar").

## Botones/acciones vinculadas
- `cotizacion.complete.button` (módulo `cotizacion`): "Completar cotización".

## Campos especiales
- Tabla `api_key`: `company_id`, `business_unit_id` (opcional), `name`,
  `key_prefix`, `key_hash`, `last_used_at`, `is_deleted` + auditoría.
- Migración: `20261103100000-quote-requested-and-api-key.js`.
