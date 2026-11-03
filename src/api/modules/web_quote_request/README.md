# Módulo: web_quote_request (Pedidos de cotización desde la web)

Pedido explícito del usuario: que desde la web de la empresa el cliente elija
productos (por SKU) y cantidades, y que eso llegue al sistema como una
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
    { "sku": "TAZA-01", "quantity": 120 },
    { "sku": "LAP-AZ", "quantity": 50 }
  ]
}
```
- `items`: de 1 a 50; `sku` hasta 50 caracteres; `quantity` entero 1–1 000 000.
- Un SKU repetido se suma en un solo item. El SKU se compara sin distinguir
  mayúsculas.
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
    "items_added": [{ "sku": "TAZA-01", "product_id": 99, "product_name": "Taza blanca", "quantity": 120 }],
    "missing_items": [{ "sku": "LAP-AZ", "quantity": 50 }],
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
- **SKU inexistente** (pedido explícito del usuario): no entra a la
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
  siguiente más chica que sí tenga. Sin técnica y sin IGV: los define el
  equipo.
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
