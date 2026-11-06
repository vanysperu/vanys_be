# Módulo: company (empresas / tenants)

## Código de módulo (RBAC)
- `platform`: alta, edición y deshabilitado de empresas (solo `is_system`,
  `requireSystemRole`).
- `document_settings`: "Documentos de la empresa" (branding del PDF de
  cotización) de la propia empresa.

## Endpoints
| Método | Ruta                            | Acción                         | Acceso |
|--------|---------------------------------|--------------------------------|--------|
| GET    | /company/list                   | list (pag)                     | `requireSystemRole` |
| POST   | /company/create                 | create                         | `requireSystemRole` · `platform.company.create.button` |
| PUT    | /company/update/:id             | update                         | `requireSystemRole` · `platform.company.update.button` |
| PUT    | /company/disable/:id            | disable (toggle)               | `requireSystemRole` · `platform.company.disable.button` |
| GET    | /company/my-document-settings   | ver documentos de la empresa   | `document_settings.get.endpoint` |
| PUT    | /company/my-document-settings   | editar documentos de la empresa | `document_settings.update.button` |

## Vistas de frontend vinculadas
- Empresas (Plataforma)
- `document_settings.view` (`/configuracion/documentos`)

## Botones/acciones vinculadas
- platform.company.create.button
- platform.company.update.button
- platform.company.disable.button
- document_settings.update.button
- document_settings.uploadAsset.button (subida del logo, ver `uploads/README.md`)
- En la misma pantalla, las cuentas de pago se agregan, **editan** (tipo, nombre,
  número y QR), deshabilitan y eliminan con los botones `variable_general.*`
  (ver `variable_general/README.md`). Editar una cuenta no cambia su historial:
  pagos y movimientos la referencian por id.

## Reglas de negocio propias del módulo
- Una empresa inactiva se puede seguir editando.
- `my-document-settings`: la empresa sale del token; el Super Administrador
  la elige (`company_id`). Whitelist de campos: `business_name`, `address`,
  `phone`, `logo_url`, `legal_terms_caption`; nunca `ruc`, `theme_color` ni
  `is_deleted`.
- **Cambio de logo** (`update` y `my-document-settings`,
  `updateCompanyReplacingLogo`): en una transacción se valida que el logo
  nuevo sea una imagen existente de la misma empresa (`400` si no), se
  actualiza la empresa y se borra la imagen del logo anterior. Así no
  quedan imágenes huérfanas en `company_asset`.

## Campos especiales
- `logo_url`: ruta pública `/uploads/company-assets/<company_id>/<uuid>.<ext>`
  de una imagen guardada en `company_asset`.
- `product_images_enabled` (BOOLEAN, default `false`): fotos de productos
  habilitadas para la empresa. Solo lo cambia el Super Administrador (crear o
  editar empresa). Apagado: no se suben ni se muestran fotos de productos (las
  ya guardadas se conservan). `/access/me` lo expone como
  `productImagesEnabled`. Ver `product/README.md`.
- `invoice_storage_system` (BOOLEAN, default `true`) e `invoice_storage_drive`
  (BOOLEAN, default `false`): dónde se guardan los archivos de las facturas de
  la empresa (sistema, Google Drive o ambos). Solo los cambia el Super
  Administrador. Ver [`invoice`](../invoice/README.md) y
  [`google_drive`](../google_drive/README.md).
