# Release 1.10.0 — cómo subirlo a producción

> **1.10.1 / 0.10.1 (26 y 27-nov):** arreglos del modo enseñanza, colores vivos y velocidad (ver
> PROGRESO.md, "Arreglos del modo enseñanza" y "Colores vivos y velocidad").
> - **Una migración:** `20261127100000-performance-indexes` (12 índices; la app la aplica sola al
>   arrancar, en segundos). No hay seeders ni variables nuevas.
> - **Una librería nueva en el servidor:** `compression` (comprime las respuestas). Hostinger la instala
>   sola desde el lockfile.
> - Se sube igual que abajo: zip en hPanel y reiniciar.
> - Después, probar "Aprender" → "Entrar a la práctica" → una lección → "Volver a mi cuenta", y que las
>   pantallas se vean con sus colores.

> Versión **1.10.0** (backend) / **0.10.0** (frontend), rama `main` (= `feature/modo-ensenanza`, que incluye
> los pedidos del 21-nov). Producción está en **1.8.2**. Lo validado está en la sección 6.

## 1. Qué trae (desde la 1.8.2)

| Para el usuario | Detalle |
|---|---|
| Precio que se borra | Vaciar un precio de producto o técnica lo deja vacío (antes quedaba el viejo); 0 sigue siendo 0 |
| Inputs numéricos | La rueda del mouse o el touchpad ya no cambian un monto sin querer |
| «No aceptado» visible | Se ve deshabilitado con el motivo cuando no se puede usar |
| Cambiar a cualquier estado | Administradores y Super Admin, con un selector y una nota en el historial |
| Descuento por producto | % o "precio final por unidad"; el PDF muestra precio de lista, descuento y total |
| Enlace de la cotización | Abre el PDF mismo; "Enviar PDF y enlace" por WhatsApp |
| IGV del mes, explicado | En Caja, "Ver cómo se calculó": cobro por cobro y compra por compra, con Excel |
| Diseños (mockups) | Pestaña "Diseños" en la cotización, solo para el equipo |
| Reportes en Excel | Cotizaciones, Caja, pagos, facturas, IGV, stock y órdenes de compra |
| PDF de la orden de compra | Con foto, código y cantidad de cada producto |
| Préstamos | Préstamos a personas con interés, sus cobros, y su efecto en Caja y Estadísticas |
| Cuentas bancarias con CCI | Número de cuenta y CCI (20 dígitos) en Documentos de la empresa y en el PDF |
| **Modo enseñanza ("Aprender")** | 33 lecciones guiadas que obligan a hacer cada paso, en una empresa de práctica por persona. Ver abajo |

**Modo enseñanza:**
- Menú **Aprender** o perfil → "Aprender a usar el sistema" → "Entrar a la práctica".
- Cada persona practica en su propia empresa de práctica, con ejemplos y sus mismos permisos. Nada toca los
  datos reales.
- Desde la práctica no sale ningún correo.
- El administrador ve el avance de su equipo.
- Las empresas de práctica no aparecen en Empresas ni en las estadísticas de plataforma del Super Admin.

Cambios de comportamiento para avisar al equipo:
- Una cuenta de pago (banco, Yape, Plin) siempre es de una empresa; ya no se crean cuentas "globales".
- Hay un ítem nuevo en el menú: **Aprender**.

## 2. Antes de subir (obligatorio)

1. **Respaldo de la base de producción:** hPanel → Bases de datos → phpMyAdmin → Exportar (rápido, SQL).
   Guardar el archivo: es la vuelta atrás.
2. Conservar el zip de la 1.8.2.

## 3. Variables de entorno

- **No hay variables nuevas.**
- **No cambiar** `SECRET_HIDDEN_KEY`, `GOOGLE_DRIVE_TOKEN_KEY`, `VAPID_PUBLIC_KEY` ni `VAPID_PRIVATE_KEY`.
  El `variables-entorno.env` que genera `npm run release` trae unas nuevas al azar: ignóralas.
- Cambiarlas desconectaría el Drive de cada empresa y apagaría los avisos al teléfono.

## 4. Subir

1. hPanel → tu app Node.js → subir `deploy/salida/grulla-app.zip` y reiniciar.
   **No** importar el `grulla_produccion.sql`: es solo para una instalación desde cero.
2. Al arrancar, la app aplica **sola** lo pendiente, con un candado para que no corra dos veces. Alternativa a
   mano desde la PC: `npm run db:upgrade-production` (primero sin `--aplicar`).
   - **Migraciones (5):**
     - `20261121100000` descuento por producto
     - `20261121100100` diseños
     - `20261121100200` préstamos
     - `20261121100300` CCI
     - `20261121100400` modo enseñanza
   - **Seeders (8):** `20261121100100` … `20261121100800`, con los permisos de cada novedad.
3. **sharp** (fotos en el PDF de la orden de compra) trae un binario para Linux (`@img/sharp-linux-x64`, ya en
   el lockfile). Hostinger lo instala solo. Revisar el PDF de una orden con foto después de subir.

## 5. Después de subir: revisar

- `https://<dominio>/api/health` responde OK.
- Abrir una cotización, ver su PDF (con el CCI si la cuenta lo tiene) y su enlace.
- Caja → "Ver cómo se calculó" el IGV.
- Menú Aprender → "Entrar a la práctica" → hacer "Conoce el sistema" → "Volver a mi cuenta".
- Órdenes de compra → PDF de una orden.

## 6. Validación hecha antes de este release

- **E2E del sistema completo** (`npm run test:e2e:full`, build de producción): **61 de 61**.
  - Recorrido desde la base de fábrica: empresa, usuarios, cotización, cobros, compras, Caja, préstamos y
    estadísticas.
  - Las 33 lecciones del modo enseñanza.
- **Pruebas del backend (jest):** **78 de 78 suites, 717 pruebas** en verde (1 omitida a propósito), en una
  instancia aparte sobre la base de desarrollo, con un admin de reemplazo.
- **Ensayo de la actualización.** Se usó una copia de la base de desarrollo, vuelta al estado de producción
  (1.8.2), en una base temporal que ya se borró.
  1. `db:upgrade-production` listó exactamente las 5 migraciones y los 8 seeders pendientes, lo mismo que le
     falta a producción (leído de su `SequelizeMeta`).
  2. El **build de producción arrancó en modo producción**, aplicó solo esos 13 cambios y respondió
     `/api/health`.
  3. El resultado quedó idéntico a la base de desarrollo: 1123 columnas, 320 índices, 156 claves, 279
     recursos.
  - Única diferencia: 5 permisos de "Exportar Excel" para roles de prueba creados después. El seeder da el
    permiso a todos los roles que existen al actualizar, que es lo correcto.
- Las 4 migraciones de los pedidos del 21-nov se deshicieron sin errores en el ensayo, así que sus vueltas atrás
  funcionan.

## 7. Si algo sale mal

Volver a subir el zip de la 1.8.2 y **restaurar el respaldo** del paso 2 (phpMyAdmin → Importar). No arreglar
la base a mano a medias.
