# Módulo: company_feature (Funcionalidades por empresa)

Sprint 2, base común (plan §3.1). Dice qué tiene contratado cada empresa; el
rol sigue decidiendo qué usuario lo usa (RBAC sin cambios). Los interruptores
viejos que son columnas de `company` (`product_images_enabled`,
`invoice_storage_*`) no se migraron.

## Código de módulo (RBAC)
No es un módulo de menú: sus recursos cuelgan de Plataforma → Empresas
(`platform.company.theme.view`) y no se otorgan a ningún rol (solo Super
Administrador, con `requireSystemRole`). Seeder:
`20261114100100-seed-supplier-module.js`.

## Endpoints
| Método | Ruta                          | Acción | Recurso |
|--------|-------------------------------|--------|---------|
| GET    | /company-feature/:companyId   | catálogo con el estado de cada funcionalidad | `company_feature.get.endpoint` |
| PUT    | /company-feature/:companyId   | `{ features: { codigo: boolean } }` | `company_feature.update.button` |

## Funcionalidades
| Código | Para qué |
|--------|----------|
| `supplier_stock` | Stock de proveedores (ítem 6) |

Cada ítem nuevo que necesite una agrega su código en
`types/company_feature.types.ts` y en `services/shared/feature_catalog.ts`.

## Cómo se usa
- `GET /access/me` devuelve `features: string[]` (vacío para el Super
  Administrador, que no tiene empresa).
- Middleware `requireCompanyFeature("supplier_stock")`
  (`src/middlewares/require-company-feature.ts`): 403 `FEATURE_DISABLED` si la
  empresa del usuario no la tiene. El Super Administrador pasa; el service
  valida la empresa que eligió.
- Apagar no borra datos: solo los oculta.

## Tabla
`company_feature (company_id, feature_code, enabled, settings JSON, auditoría)`,
única por `(company_id, feature_code)`.
