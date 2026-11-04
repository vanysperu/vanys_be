# Módulo: uploads (imágenes de marca de la empresa)

## Código de módulo (RBAC)
No es un módulo de menú propio: la subida la usa la pantalla "Documentos de
la empresa" y se autoriza con el resource de ese módulo.

## Endpoints
| Método | Ruta                                           | Acción                  | Acceso |
|--------|------------------------------------------------|-------------------------|--------|
| POST   | /api/uploads/company-asset                     | subir logo / QR de pago | `document_settings.uploadAsset.button` |
| GET    | /uploads/company-assets/:companyId/:fileName   | servir la imagen        | público (sin sesión) |

## Vistas de frontend vinculadas
- documentSettings (pantalla "Documentos de la empresa")

## Botones/acciones vinculadas
- document_settings.uploadAsset.button

## Reglas de negocio propias del módulo
- **Las imágenes se guardan en la base de datos** (tabla `company_asset`,
  `MEDIUMBLOB`), no en disco. El hosting de producción (Hostinger, sin VPS)
  reemplaza la carpeta de la app en cada despliegue, incluso al guardar una
  variable de entorno, así que todo lo subido a disco se perdía y los PDF
  quedaban sin logo. En la base sobreviven y entran en cada respaldo.
- La URL pública mantiene el formato de cuando estaban en disco
  (`/uploads/company-assets/<company_id>/<uuid>.<ext>`): los `logo_url` ya
  guardados siguen funcionando. Si una imagen no está en la tabla, se busca
  en la carpeta `UPLOADS_DIR` como respaldo, para las subidas antiguas.
- Solo PNG, JPG y WEBP, de máximo 2 MB. Se valida en dos niveles:
  1. el tipo MIME declarado;
  2. la **firma real del contenido**, que tiene que coincidir con ese tipo.
- La extensión del archivo guardado sale del tipo validado, **nunca del
  nombre que manda el navegador**. Antes se podía subir un `.html`
  declarándolo `image/png` y se servía como página web desde el mismo
  dominio (XSS con robo de la sesión).
- El nombre es un UUID nuevo en cada subida y nunca se sobrescribe, así que
  se sirve con `Cache-Control: immutable` (30 días).
- `fileName` solo acepta `uuid.ext`: cualquier otra forma ni se consulta, lo
  que impide el path traversal en el respaldo desde disco.
- La imagen se sirve sin sesión porque la piden los `<img>` y el generador
  de PDF. Lo que se expone es branding que la empresa misma imprime en sus
  cotizaciones, detrás de un UUID imposible de adivinar.
- **Empresa dueña de la imagen:** la del token; el Super Administrador (sin
  empresa propia) la manda como `company_id` en el form-data
  (`resolveTargetCompanyId`).
- **No quedan imágenes huérfanas** (`purgeUnusedCompanyAssets`): una imagen
  se borra cuando ya no la usa ninguna fila de SU empresa (`company.logo_url`
  y columnas de imagen heredadas, `business_unit.logo_url`, `ref2` de
  `general_variable` y `product.image_path` — fotos de productos, también de
  productos deshabilitados):
  - Al reemplazar el logo o el QR de una cuenta, o al eliminar la cuenta, la
    imagen anterior se borra en la misma transacción.
  - El front sube la imagen al elegir el archivo y la asigna recién al
    "Guardar": una subida sin usar se respeta 24 h y después se borra (en la
    siguiente subida o guardado de esa empresa).
  - El `DELETE` siempre lleva `company_id = <empresa>`: limpiar una empresa
    nunca toca imágenes de otra.
- Antes de guardar una ruta de imagen como logo o QR
  (`assertCompanyAssetUsable`), tiene que ser de esa misma empresa y seguir
  existiendo; si no, `400`.

## Campos especiales
- `company_asset.data` es `MEDIUMBLOB` (hasta 16 MB; el tope real es 2 MB).
