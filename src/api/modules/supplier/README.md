# Módulo: supplier (Proveedores)

Sprint 2, base común (plan §3.2, decisión D7: módulo mínimo). Lo usan los
códigos de producto y las fuentes de stock (ítem 6); después las facturas de
compra (3), los ingresos de almacén (2) y los transportistas de la GRE (1).

## Código de módulo (RBAC)
`supplier` (id preferido 24). Seeder: `20261114100100-seed-supplier-module.js`.

## Endpoints
| Método | Ruta                    | Acción                     | Recurso |
|--------|-------------------------|----------------------------|---------|
| GET    | /supplier/list          | list (paginado)            | `supplier.list.endpoint` |
| POST   | /supplier/create        | create (201)               | `supplier.create.button` |
| PUT    | /supplier/update/:id    | update                     | `supplier.update.button` |
| PUT    | /supplier/disable/:id   | deshabilitar / habilitar   | `supplier.disable.button` |

Listado: `page`, `limit`, `orderBy` (`name`, `document_number`, `created_at`,
`active`), `orderDir`, `searchTerm` (nombre, nombre comercial o documento),
`status` (`active` / `inactive`) y `companyId` (solo Super Administrador).

## Vistas de frontend vinculadas
- `supplier.list` → `/proveedores` (menú Ventas, después de Productos).

## Botones/acciones vinculadas
- `supplier.create.button`, `supplier.update.button`, `supplier.disable.button`.

## Quién recibe qué (seeder)
Todo el módulo: los roles con `producto.create.button` (Administrador). Es
configuración del catálogo: nunca el Gestor (CLAUDE.md §11.1).

## Reglas de negocio
- Nombre único por empresa (sin distinguir mayúsculas) y número de documento
  único por empresa: `409 SUPPLIER_DUPLICATE`. Entre empresas sí se repiten.
- Un usuario de empresa crea en la suya (lo que mande en `company_id` se
  ignora o da 403 si es otra); el Super Administrador elige la empresa.
- Editar o deshabilitar un proveedor de otra empresa → 404 (no se revela que
  existe).
- `disable` es soft-delete (`active`): el proveedor deja de ofrecerse, sus
  códigos y su historial quedan. No hay borrado físico (la FK de
  `product_code.supplier_id` es RESTRICT).
- Editar el nombre lo copia en `product_code.supplier` de sus códigos (misma
  transacción).
- `mtc_registration` solo se guarda si `is_carrier`.

## Migración de datos
`20261114100000-create-company-feature-and-supplier.js` creó un proveedor por
cada texto distinto de `product_code.supplier` en cada empresa y enlazó
`product_code.supplier_id` (en la copia de desarrollo: 56 proveedores, 58
códigos enlazados).

## Pruebas
`tests/supplier.test.ts`.
