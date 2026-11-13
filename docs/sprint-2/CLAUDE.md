# Reglas del Proyecto (actualizado)

Todo lo de la versión anterior sigue vigente (fechas UTC-5 separadas en string,
seguridad, tsconfig strict, etc). Esto se agrega/reemplaza:

---

## 0. ALCANCE DEL PROYECTO (OBLIGATORIO, PRIORIDAD MÁXIMA)

- **Prohibido modificar, leer para reescribir, ejecutar comandos destructivos,
  o escribir datos fuera de `C:\Users\dev-d\Desktop\vn`.** Este directorio es
  el único límite del proyecto. Ninguna otra carpeta del sistema (otros
  proyectos como `FLOWWW`, `depi_comisiones`, `depiPort`, etc., aunque
  aparezcan en las "Additional working directories" del entorno) se toca sin
  pedirlo explícitamente en el mensaje del usuario para ESA tarea puntual.
- Antes de correr un servidor de desarrollo local (`npm run dev`, etc.) en un
  puerto fijo, verificar primero qué proceso ya lo tiene ocupado
  (`Get-NetTCPConnection`/`Get-CimInstance Win32_Process`) — un puerto
  ocupado puede pertenecer a otro proyecto ajeno a `vn`, no asumir que es
  este mismo backend/frontend solo porque el puerto coincide.
- Si una base de datos, puerto o recurso externo resulta estar compartido
  con otro proyecto (mismo host/puerto/nombre de esquema), se avisa
  explícitamente al usuario antes de escribir cualquier dato ahí — no se
  asume que es seguro solo porque conecta.

---

## 1. ARQUITECTURA MODULAR DEL BACKEND (OBLIGATORIO)

### Estructura por módulo — NUNCA archivos monolíticos
Cada módulo de negocio vive en su propia carpeta. Dentro, 3 carpetas fijas:
`controllers/`, `routers/`, `services/`. **Un archivo = una acción.** Prohibido
meter varios controllers o services en el mismo archivo.

```
src/
  modules/
    users/
      controllers/
        create.controller.ts
        update.controller.ts
        list.controller.ts
        disable.controller.ts
        getById.controller.ts        # si aplica
      services/
        create.service.ts
        update.service.ts
        list.service.ts
        disable.service.ts
      routers/
        users.router.ts
      validators/
        users.validator.ts
      types/
        users.types.ts
      README.md                     # documentación obligatoria del módulo
    products/
      controllers/ ...
      services/ ...
      routers/ ...
      README.md
  core/
    rbac/                           # sistema de roles/permisos (ver sección 2)
    middlewares/
    utils/
  config/
  database/
    migrations/
    seeders/
```

### Reglas de nomenclatura
- Servicio y controller siempre en pares con el mismo nombre de acción:
  `create.controller.ts` ↔ `create.service.ts`.
- El controller NUNCA contiene lógica de negocio, solo:
  1. Extrae `req.body/params/query` (ya validado por middleware).
  2. Llama al service.
  3. Responde con `res.json()` usando el formato de respuesta estándar (sección 5).
- El service NUNCA conoce `req`/`res`. Recibe DTOs tipados y devuelve datos o
  lanza `AppError`.
- Cada módulo expone sus 4 acciones base como mínimo:
  `create`, `update`, `list`, `disable`.
  - **`disable` es SIEMPRE soft-delete** (`active: false`), nunca `DELETE`
    físico salvo módulos explícitamente marcados como "catálogo temporal" en
    su README.
  - No existe acción `delete` física por defecto.

### Ejemplo mínimo de un par controller/service
```typescript
// modules/users/services/create.service.ts
import { AppError } from '@/core/errors/AppError';
import { db } from '@/database/client';
import type { CreateUserDto, User } from '../types/users.types';

export async function createUserService(
  dto: CreateUserDto,
  actorId: string,
): Promise<User> {
  const exists = await db.user.findUnique({ where: { email: dto.email } });
  if (exists) throw new AppError(409, 'El email ya está registrado');

  return db.user.create({
    data: {
      ...dto,
      created_by: actorId,
      created_at: new Date(), // UTC real, se formatea al salir por el controller
      updated_by: actorId,
      updated_at: new Date(),
      active: true,
    },
  });
}
```

```typescript
// modules/users/controllers/create.controller.ts
import { Request, Response } from 'express';
import { asyncHandler } from '@/core/utils/asyncHandler';
import { createUserService } from '../services/create.service';
import { utcToLocalParts } from '@/core/utils/dateUtils';
import { ok } from '@/core/utils/response';

export const createUserController = asyncHandler(
  async (req: Request, res: Response) => {
    const user = await createUserService(req.body, req.user!.id);
    const { date, time } = utcToLocalParts(user.created_at);
    return ok(res, 201, { ...user, createdAt: { date, time } });
  },
);
```

```typescript
// modules/users/routers/users.router.ts
import { Router } from 'express';
import { validate } from '@/core/middlewares/validate';
import { authenticate } from '@/core/middlewares/authenticate';
import { authorize } from '@/core/rbac/authorize';
import { createUserSchema } from '../validators/users.validator';
import { createUserController } from '../controllers/create.controller';
import { updateUserController } from '../controllers/update.controller';
import { listUsersController } from '../controllers/list.controller';
import { disableUserController } from '../controllers/disable.controller';

const router = Router();
const MODULE = 'users'; // código de módulo registrado en RBAC (ver sección 2)

router.post('/', authenticate, authorize(MODULE), validate(createUserSchema), createUserController);
router.put('/:id', authenticate, authorize(MODULE), updateUserController);
router.get('/', authenticate, authorize(MODULE), listUsersController);
router.patch('/:id/disable', authenticate, authorize(MODULE), disableUserController);

export default router;
```

Registro central de routers (único lugar donde se importan todos):
```typescript
// core/router.ts
import { Router } from 'express';
import usersRouter from '@/modules/users/routers/users.router';
import productsRouter from '@/modules/products/routers/products.router';

const router = Router();
router.use('/users', usersRouter);
router.use('/products', productsRouter);
export default router;
```

---

## 2. SISTEMA RBAC (roles/accesos manejado 100% desde el backend)

### Principio central
El backend es la **única fuente de verdad** de qué rol puede acceder a qué:
rutas (endpoints), vistas del frontend y botones/acciones dentro de esas
vistas. El frontend nunca decide permisos, solo consulta al backend qué tiene
habilitado y renderiza en función de eso.

### Concepto: MÓDULO como unidad de permiso
- Cada módulo del backend (`users`, `products`, etc.) tiene un
  **código único** (`MODULE`) registrado en una tabla `modules`.
- Un módulo agrupa: sus endpoints, su(s) vista(s) de frontend y sus botones/
  acciones. **Al asignar un módulo completo a un rol, ese rol obtiene
  automáticamente TODOS los accesos de ese módulo** (endpoints + vistas +
  botones) — no se asignan permisos sueltos uno por uno.
- Si un módulo necesita granularidad interna (ej: "users" con
  sub-permiso "puede deshabilitar"), eso se modela como **sub-módulo o
  acción registrada dentro del mismo módulo**, nunca como lógica condicional
  ad-hoc en el controller.

### Tablas mínimas (con sus 4 campos de auditoría, ver sección 3)

```
modules (id, code, name, description, ...audit)
resources (id, module_id FK, type['endpoint'|'view'|'button'],
  identifier, ...audit)
roles (id, name, description, ...audit)
roles_modules (id, role_id FK, module_id FK, ...audit)   # tabla puente
users_roles (id, user_id FK, role_id FK, ...audit)
```

`roles_modules` es la única tabla de asignación de permisos. Un rol tiene
N módulos; cada módulo trae consigo todo lo que registró en `resources`.

### Middleware de autorización (sin ifs anidados)
```typescript
// core/rbac/authorize.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/core/errors/AppError';
import { roleHasModule } from './rbacRepository';

export const authorize = (moduleCode: string) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const roleId = req.user?.roleId;
    if (!roleId) return next(new AppError(401, 'No autenticado'));

    const allowed = await roleHasModule(roleId, moduleCode);
    if (!allowed) return next(new AppError(403, 'No tienes acceso a este módulo'));

    return next();
  };
```
- Usar **guard clauses** (`if (!x) return`) en vez de anidar. Ningún archivo
  del proyecto debe tener un `if` dentro de otro `if` en el "camino feliz":
  siempre se corta temprano y se sigue el flujo lineal.
- `roleHasModule` debe ir **cacheado** (Redis o cache en memoria con TTL
  corto) porque se llama en cada request — es el punto más caliente del
  sistema en cuanto a rendimiento.

### Endpoint de "mis accesos" para el frontend
El front nunca hardcodea permisos. Al hacer login (o al refrescar sesión),
el backend expone:

```
GET /auth/my-access
{
  "modules": ["users", "products"],
  "views": ["users.list", "users.detail"],
  "buttons": ["users.create.button", "users.disable.button"]
}
```

El frontend usa esto solo para **mostrar/ocultar UI** (UX). La autorización
real siempre se revalida en el backend en cada endpoint — el frontend jamás
es la barrera de seguridad.

### Registro de un módulo nuevo (checklist obligatorio para el agente)
Cuando se crea un módulo nuevo, SIEMPRE:
1. Insertar/seedear su fila en `modules`.
2. Registrar cada endpoint, vista y botón relevante en `resources` vinculado
   a ese `module_id`.
3. Documentar esto en el `README.md` del módulo (sección 6).
4. Ningún endpoint puede quedar sin `authorize(MODULE)` — si un endpoint no
   lleva ese middleware, se considera un bug de seguridad.

---

## 3. AUDITORÍA (obligatorio en TODA tabla)

Toda tabla creada, sin excepción, debe tener estos 4 campos:

```typescript
created_by: string;      // id de usuario que creó el registro
created_at: Date;        // timestamp UTC real (Date/timestamptz en DB)
updated_by: string;      // id de usuario de la última modificación
updated_at: Date;        // timestamp UTC real
```

- Estos campos se guardan como `Date`/`timestamptz` en la base de datos
  (nunca string ahí), y se convierten a `{ date, time }` string (sección de
  fechas UTC-5) recién al salir por el controller hacia el cliente.
- El campo de estado (`active: boolean`) para el soft-delete de
  `disable` **no cuenta** como campo de auditoría, es un campo de
  negocio aparte, pero también es obligatorio en cualquier tabla que tenga
  acción de deshabilitar.
- Nunca actualizar `created_by`/`created_at` en un `UPDATE`. Nunca dejar
  `updated_by`/`updated_at` sin tocar en un `UPDATE`.
- Un helper central se encarga de esto, para no repetirlo a mano en cada
  service:

```typescript
// core/utils/auditFields.ts
export function withCreateAudit<T extends object>(data: T, actorId: string) {
  const now = new Date();
  return { ...data, created_by: actorId, created_at: now, updated_by: actorId, updated_at: now };
}

export function withUpdateAudit<T extends object>(data: T, actorId: string) {
  return { ...data, updated_by: actorId, updated_at: new Date() };
}
```

---

## 4. PAGINACIÓN (obligatoria en TODO endpoint de listar)

Ningún endpoint de listado devuelve todo sin límite. Formato estándar:

**Request:**
```
GET /users?page=1&limit=20&orderBy=created_at&orderDir=desc
```

**Validación (zod, reusable en todos los módulos):**
```typescript
// core/validators/pagination.validator.ts
import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  orderBy: z.string().default('created_at'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});
```

**Response estándar (misma forma en TODOS los módulos):**
```typescript
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
```

```typescript
// core/utils/paginate.ts
export function buildPaginationMeta(total: number, page: number, limit: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
```

- El `service` de `list` de cada módulo SIEMPRE recibe `{ page, limit,
  orderBy, orderDir }` y SIEMPRE hace `skip/take` (o `LIMIT/OFFSET`) en la
  query, nunca trae todo a memoria y pagina en JS.
- Índice en DB obligatorio sobre la columna usada por defecto en
  `orderBy` (normalmente `created_at`).

---

## 5. RESPUESTA ESTÁNDAR DE API Y MANEJO CENTRALIZADO DE ERRORES (OBLIGATORIO)

Toda respuesta exitosa y de error sigue **exactamente el mismo esqueleto**,
sin excepción, para que el frontend tenga un solo parser genérico y nunca
tenga que adivinar la forma de la respuesta según el endpoint:

```typescript
// core/types/apiResponse.types.ts
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: unknown; // detalle de validación (zod issues, etc.)
  code?: string;     // código estable para el front (ej. 'VALIDATION_ERROR', 'NOT_FOUND')
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
```

```typescript
// core/utils/response.ts
import { Response } from 'express';

export function ok(res: Response, status: number, data: unknown, message?: string) {
  return res.status(status).json({ success: true, data, message });
}

export function fail(res: Response, status: number, message: string, errors?: unknown, code?: string) {
  return res.status(status).json({ success: false, message, errors, code });
}
```

### Errores: SIEMPRE por un único canal (middleware global, prohibido try/catch manual repetido)
- Ningún controller/service maneja el `res.status().json()` de un error a
  mano. Los errores se **lanzan** (`throw new AppError(...)`) y un único
  middleware de errores, al final del pipeline de Express, los captura y
  responde con el mismo esqueleto de arriba. Así ningún endpoint puede
  "olvidarse" de devolver el formato correcto.

```typescript
// core/errors/AppError.ts
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public errors?: unknown,
    public code?: string,
  ) {
    super(message);
  }
}
```

```typescript
// core/middlewares/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { AppError } from '@/core/errors/AppError';
import { fail } from '@/core/utils/response';
import { logger } from '@/core/utils/logger';

// Middleware de errores: SIEMPRE al final de app.use(...), con 4 argumentos.
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    return fail(res, err.status, err.message, err.errors, err.code);
  }

  // Error no controlado: se loguea completo pero nunca se filtra el detalle interno al cliente.
  logger.error(err);
  return fail(res, 500, 'Error interno del servidor', undefined, 'INTERNAL_ERROR');
}
```

```typescript
// core/utils/asyncHandler.ts
import { Request, Response, NextFunction, RequestHandler } from 'express';

// Envuelve controllers async para que cualquier rechazo de promesa
// llegue al errorHandler central en vez de colgar el request.
export const asyncHandler = (fn: RequestHandler): RequestHandler =>
  (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
```

- Todo controller se envuelve con `asyncHandler` (ya usado en la sección 1).
  Ningún controller/service usa `try/catch` para formatear una respuesta de
  error — solo `throw new AppError(...)`. `try/catch` solo se usa cuando hay
  que hacer algo distinto al fallar (rollback, cleanup, log puntual) y
  siempre re-lanza el error (`throw`) al final.
- `errorHandler` se registra **una sola vez**, al final de `core/app.ts`,
  después de montar todos los routers.
- El frontend, gracias a este contrato único, implementa **un solo
  interceptor** (sección 7) que sabe leer `success`, `data`/`message`/
  `errors`/`code` sin importar qué endpoint respondió.

---

## 6. DOCUMENTACIÓN OBLIGATORIA POR MÓDULO

Cada módulo debe tener su `README.md` con esta plantilla mínima (el agente
la genera/actualiza cada vez que crea o modifica un módulo):

```markdown
# Módulo: users

## Código de módulo (RBAC)
`users`

## Endpoints
| Método | Ruta                | Acción       | Requiere módulo |
|--------|---------------------|--------------|------------------|
| POST   | /users              | create       | users            |
| PUT    | /users/:id          | update       | users            |
| GET    | /users              | list (pag)   | users            |
| PATCH  | /users/:id/disable  | disable      | users            |

## Vistas de frontend vinculadas
- users.list
- users.detail

## Botones/acciones vinculadas
- users.create.button
- users.update.button
- users.disable.button

## Reglas de negocio propias del módulo
- Email único.
- No se puede deshabilitar el último usuario con rol "admin".

## Campos especiales
- (fechas/horas separadas, campos calculados, etc.)
```

---

## 7. FRONTEND — REACT + TS + SHADCN/UI + TAILWIND CSS

> Cambio de stack: esta versión reemplaza Bootstrap/Metronic. El stack de
> estilos/UI del frontend en adelante es **React + TypeScript + Tailwind
> CSS + shadcn/ui**. Prohibido mezclar Bootstrap, react-bootstrap, Metronic,
> CSS-in-JS o `.css`/`.scss` sueltos por componente (salvo animaciones muy
> puntuales que no se puedan resolver con clases de Tailwind).

### Stack fijo
- **React 18+ con TypeScript** (sin `any`, `strict` en `tsconfig`).
- **Tailwind CSS** como única fuente de estilos utilitarios. Config central
  en `tailwind.config.ts` con tokens de diseño (colores, spacing, radius)
  — nunca colores hardcodeados sueltos en componentes.
- **shadcn/ui** para los primitivos de UI (Button, Dialog, Table, Select,
  Dropdown, Toast, Sheet, Form, etc.), instalados vía su CLI dentro de
  `src/components/ui/` (carpeta generada por shadcn, no se edita el
  código base a mano salvo ajustes de theming). Sobre esos primitivos se
  construyen los componentes compartidos reales del proyecto (ver abajo).
- **`clsx` + `tailwind-merge`** (helper `cn()`) para clases condicionales,
  nunca concatenación manual de strings.
- **TanStack Query (React Query)** para TODO el estado de servidor (fetch,
  cache, mutaciones) — nunca `useEffect` + `useState` a mano para pedir
  datos a la API. Ver uso correcto abajo.
- **React Hook Form + Zod** para formularios y su validación — reemplaza a
  `formik`/`yup`. El mismo shape de Zod se reutiliza para tipar el DTO que
  se manda al backend.
- **Zustand** (opcional, solo si hace falta) para estado de cliente puro
  que no sea de servidor (ej. estado de UI global tipo sidebar colapsado).
  Nunca se usa para cachear datos de la API — eso es trabajo de React Query.
- **@dnd-kit/core + @dnd-kit/utilities** para drag-and-drop (tableros tipo
  Kanban: cotizaciones por estado, items de una cotización por etapa de
  producción). Aprobado explícitamente por el usuario en vez de
  react-beautiful-dnd (deprecado) — no agregar otra librería de DnD sin
  volver a preguntar.
- **Recharts (versión fijada `3.8.0`)** para gráficas, siempre a través del
  componente `Chart` de shadcn/ui (`components/shared/ui/chart.tsx`, el que
  trae `ChartContainer`/`ChartTooltip`/`ChartLegend`). Aprobado
  explícitamente por el usuario ("usa una librería bonita para gráficas").
  La versión es la misma con la que shadcn escribió su componente: no
  subirla sin probar las gráficas. Los colores de las series salen de la
  paleta validada del módulo de estadísticas (claro/oscuro), nunca de
  colores elegidos a ojo. No agregar otra librería de gráficas sin volver a
  preguntar.
- No instalar librerías nuevas de UI/estado fuera de esta lista sin
  aprobarlo antes en este archivo o preguntar primero.

### Estructura de carpetas del frontend
```
src/
  app/
    routes/                     # definición de rutas (react-router)
      AppRoutes.tsx
      PrivateRoute.tsx           # valida sesión + acceso vía useAccess()
    providers/
      QueryProvider.tsx          # QueryClient + QueryClientProvider
      ThemeProvider.tsx
  api/
    client.ts                    # instancia única de axios/fetch + interceptor de errores (ver abajo)
    endpoints/
      users.api.ts                # funciones puras: getUsers(), createUser(dto), etc.
      auth.api.ts
  modules/                       # un módulo de negocio = un espejo del módulo backend
    users/
      components/                 # componentes propios del módulo (no genéricos)
        UserForm.tsx
        UserTable.tsx
      hooks/
        useUsers.ts                # useQuery(['users', params], ...)
        useCreateUser.ts           # useMutation + invalidateQueries
      schemas/
        user.schema.ts             # Zod schema, reusado por el form y por el tipado del DTO
      types/
        user.types.ts
      pages/
        UsersListPage.tsx
  components/
    ui/                           # generado por shadcn (NO se reimplementa a mano)
    shared/                       # componentes reutilizables propios del proyecto (ver abajo)
      DataTable.tsx
      Pagination.tsx
      ConfirmDialog.tsx
      FormField.tsx
      PageHeader.tsx
      AppSidebar.tsx               # menú dinámico (ver más abajo)
  hooks/
    shared/
      useAccess.tsx                # useQuery de /auth/my-access + useModule()/usePermission()/usePermissionButton()
  lib/
    utils.ts                      # cn(), formatters, etc.
    dateUtils.ts
  types/
    api.types.ts                  # ApiResponse<T> (mismo shape que el backend, sección 5)
```

- Cada módulo de frontend (`src/modules/<modulo>/`) espeja el módulo del
  backend por nombre. Un componente genérico (sin lógica de negocio de un
  módulo específico) NUNCA vive dentro de `modules/`, siempre en
  `components/shared/`.

### Uso correcto de React Query (obligatorio, no opcional)
- Un `QueryClient` único, creado en `app/providers/QueryProvider.tsx`, con
  defaults razonables (`staleTime` > 0 para listados que no cambian a cada
  segundo, `retry` limitado, `refetchOnWindowFocus` según el caso).
- **Query keys estructuradas y consistentes**: `['users', 'list', { page,
  limit, orderBy, orderDir }]`, `['users', 'detail', id]`. Nunca strings
  sueltos o keys inconsistentes entre hooks del mismo módulo — se centraliza
  en un objeto `usersKeys` por módulo:
  ```typescript
  // modules/users/hooks/users.keys.ts
  export const usersKeys = {
    all: ['users'] as const,
    lists: () => [...usersKeys.all, 'list'] as const,
    list: (params: UsersListParams) => [...usersKeys.lists(), params] as const,
    detail: (id: string) => [...usersKeys.all, 'detail', id] as const,
  };
  ```
- Un hook por operación, nunca lógica de fetch directa en el componente de
  página:
  ```typescript
  // modules/users/hooks/useUsers.ts
  export function useUsers(params: UsersListParams) {
    return useQuery({
      queryKey: usersKeys.list(params),
      queryFn: () => getUsers(params),
      placeholderData: keepPreviousData, // paginación sin parpadeo
    });
  }
  ```
  ```typescript
  // modules/users/hooks/useCreateUser.ts
  export function useCreateUser() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: createUser,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: usersKeys.lists() });
      },
    });
  }
  ```
- Nunca duplicar en estado local (`useState`) datos que ya vienen de
  `useQuery` — se lee directo del hook. `useState` solo para estado de UI
  puro (input controlado antes de submit, modal abierto/cerrado, etc.).
- Invalidar solo las keys necesarias (`usersKeys.lists()`), nunca
  `queryClient.invalidateQueries()` global salvo en logout.

### Cliente API único + manejo de errores (espejo del backend, sección 5)
Un solo cliente HTTP, un solo interceptor, para que ningún componente
tenga que parsear errores a mano:

```typescript
// api/client.ts
import axios from 'axios';
import type { ApiResponse } from '@/types/api.types';

export const apiClient = axios.create({ baseURL: import.meta.env.VITE_API_URL });

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // El backend SIEMPRE responde { success: false, message, errors, code } (sección 5 backend)
    const body = error.response?.data as ApiResponse<unknown> | undefined;
    const message = body && !body.success ? body.message : 'Error de conexión con el servidor';
    return Promise.reject({ message, code: body && !body.success ? body.code : undefined, raw: error });
  },
);
```

- Toda función en `api/endpoints/*.api.ts` devuelve `data` ya desempaquetado
  (`response.data.data`), tipado con el DTO/entidad correspondiente — nunca
  el `ApiResponse<T>` crudo se filtra hasta el componente.
- Los errores se muestran con un componente/hook único (ej. `toast` de
  shadcn/ui vía `useMutation({ onError })`), nunca `alert()` ni manejo
  ad-hoc por componente.

### Componentes UI reutilizables (OBLIGATORIO)
- Todo componente genérico vive en `src/components/shared/`, construido
  **sobre** los primitivos de `components/ui/` (shadcn) — nunca se
  reimplementa un modal, tabla o dropdown a mano cuando shadcn ya lo
  resuelve. Antes de crear un componente nuevo, el agente busca en
  `components/shared/` y en `components/ui/` si ya existe algo equivalente.
- Componentes base que deben existir en `components/shared/`:
  - `ConfirmDialog` (sobre `AlertDialog` de shadcn): confirmaciones de
    deshabilitar/eliminar, con variantes de texto/acción vía props.
  - `DataTable` (sobre `Table` de shadcn + `@tanstack/react-table`):
    columnas tipadas por props, integrado con `Pagination` y con el
    formato estándar de la sección 4 (`data`/`meta`).
  - `Pagination`: lee/escribe `page`/`limit` y se conecta directo al
    `meta` de la respuesta paginada.
  - `DateRangePickerField`: **un solo selector** de rango de fechas (no
    dos inputs separados de "desde"/"hasta").
  - `FormField`, `SelectField`, `TextAreaField`, `ToggleSwitch`,
    `Checkbox`: wrappers delgados sobre los componentes de `Form` de
    shadcn + React Hook Form, ya conectados a `useFormContext`.
  - `PageHeader`, `EmptyState`, `LoadingSpinner`/`Skeleton`.
  - `ToggleStatusButton`: botón de ícono único (no de texto) para la
    acción de habilitar/deshabilitar de cualquier catálogo — recibe
    `active`/`onToggle`/`entityLabel`, nunca se reimplementa el botón de
    texto ("Deshabilitar"/"Habilitar") suelto en una pantalla nueva.
- Cada componente de `shared/` es genérico: recibe props tipadas, no
  conoce endpoints ni reglas de negocio de ningún módulo específico.

### Consistencia entre vistas (OBLIGATORIO)
- Antes de construir CUALQUIER pantalla nueva (lista, formulario de
  crear/editar, fila de acciones), el agente revisa cómo ya está resuelta
  esa misma necesidad en otro módulo existente (ej. `UsersListPage.tsx`,
  `ClientsPage.tsx`, `ProductsPage.tsx`) y replica el mismo patrón — layout
  de la fila de acciones, orden de los botones (editar → deshabilitar),
  tamaño de íconos, mensajes de éxito/error — en vez de inventar una
  variante nueva para el mismo tipo de pantalla.
- Una pantalla de catálogo (listar + crear + editar + deshabilitar) sigue
  siempre la misma composición: `PageHeader` con el botón de crear a la
  derecha → `DataTable` con columnas de datos + una columna final de
  acciones alineada a la derecha (`Pencil` para editar, `ToggleStatusButton`
  para deshabilitar/habilitar) → `Pagination` debajo. Ningún módulo nuevo
  inventa su propio layout de tabla o su propia fila de botones de acción.
- Si una acción se resuelve con un componente compartido (`ToggleStatusButton`,
  `ConfirmDialog`, `Pagination`, etc.), **todas** las pantallas que tengan esa
  misma acción lo usan — no queda una pantalla vieja con la versión anterior
  a medio migrar. Al tocar un patrón compartido, el agente busca (`grep`)
  todos los usos existentes y los actualiza en el mismo cambio.
- Mismo criterio para hooks de datos: si un módulo ya resolvió "listar con
  paginación + búsqueda" o "activar/desactivar con toast", un módulo nuevo
  copia esa forma (mismo nombre de hook `useToggle<Entidad>Status`, misma
  forma de query keys) en vez de una convención distinta.

### Menú dinámico (una sola vista para todos los roles, sección 2 RBAC)
- Existe **un único árbol de navegación** (`AppSidebar` en
  `components/shared/AppSidebar.tsx`), no un menú distinto por rol. La
  estructura completa de módulos/rutas/íconos se define en un único config
  declarativo (`app/navigation/menuConfig.ts`), independiente del rol:
  ```typescript
  // app/navigation/menuConfig.ts
  export interface MenuItem {
    moduleCode: string;       // debe existir como resource tipo 'view' en el backend (sección 2)
    label: string;
    path: string;
    icon: LucideIcon;
    children?: MenuItem[];
  }

  export const menuConfig: MenuItem[] = [
    { moduleCode: 'users', label: 'Usuarios', path: '/users', icon: Users },
    { moduleCode: 'products', label: 'Productos', path: '/products', icon: Package },
  ];
  ```
- `AppSidebar` renderiza `menuConfig` filtrado por lo que devuelve
  `useAccess()` (`GET /auth/my-access`, sección 2): **lo que cambia entre
  roles no es la estructura del menú, es qué items sobreviven al filtro**.
  Un rol sin acceso a un `moduleCode` simplemente no ve ese item — nunca
  hay una versión distinta del sidebar hardcodeada por rol.
- Mismo principio para botones sensibles (crear/editar/deshabilitar/
  exportar): se envuelven con `usePermissionButton('users.create.button')`
  y se ocultan (no solo se deshabilitan visualmente) si el rol no tiene el
  botón en su lista — igual que ya definía la sección 2, ahora expresado
  también a nivel de menú.
- `PrivateRoute.tsx` sigue validando en cada navegación que la ruta actual
  esté dentro de `views` de `useAccess()`, aplanando `menuConfig` — misma
  lógica que antes tenía `PrivateRoutes.tsx`/`isRouteAllowed`, solo que
  ahora la fuente de la estructura es este único config, no rutas sueltas
  definidas ad-hoc por módulo.
- Toda ruta o botón nuevo se agrega primero como `resource` en el backend
  (sección 2) y luego se referencia por el mismo `moduleCode`/código de
  botón en `menuConfig`/`usePermissionButton` — nunca se inventan strings
  distintos entre front y back.
- Al crear cualquier ruta o botón nuevo, el agente actualiza en el mismo
  cambio la tabla "Vistas de frontend vinculadas"/"Botones/acciones
  vinculadas" del `README.md` del módulo (sección 6).

### Estándares de código (aplica a todo el frontend)
- Componentes funcionales + hooks únicamente, sin clases.
- Sin `any`; tipar props, hooks y respuestas de API explícitamente.
- Sin mutación directa de estado (`useState`/objetos de query) — siempre
  inmutable.
- Guard clauses / early return también en el frontend (misma regla que
  sección 11 para el backend) — nada de `if` anidados en el "camino feliz".
- Nombres de archivo y componente en inglés, comentarios en español cuando
  la lógica no sea obvia (misma regla que sección 9).

---

## 8. RENDIMIENTO (sistema debe ser rápido)

- Cache de permisos RBAC (sección 2) — evita ir a DB en cada request.
- Compresión de respuestas (`compression` middleware) activa siempre.
- Connection pooling configurado en el cliente de DB (nunca conexión nueva
  por request).
- Índices en toda columna usada en `WHERE`, `ORDER BY` o FK.
- Evitar N+1: usar `include`/`join` del ORM, nunca loop de queries.
- Paginación obligatoria (sección 4) — ya cubre el riesgo más común de
  lentitud.
- Nada de lógica pesada síncrona bloqueando el event loop (mover a jobs/
  colas si aplica: `bullmq`, etc.).
- **Prohibido cualquier bucle infinito o casi-infinito**, tanto en el
  backend (loops sin condición de salida clara, recursión sin caso base,
  reintentos sin límite) como en el frontend (`useEffect` que dispara un
  fetch que a su vez actualiza el estado que el mismo `useEffect` observa,
  polling sin `enabled`/condición de corte, etc.).
- **Prohibido llamar el mismo endpoint varias veces sin necesidad real**:
  - En el frontend, esto es casi siempre síntoma de una dependencia mal
    puesta en `useEffect`/`useQuery` o de no usar la cache de React Query
    (sección 7) — antes de agregar un fetch nuevo, revisar si ese dato ya
    está en cache con una key existente en vez de volver a pedirlo.
  - Nunca disparar el mismo request en un loop (`for`/`map` haciendo un
    `fetch`/`axios` por iteración) cuando existe (o se puede pedir) un
    endpoint que devuelva todo en una sola llamada — aplica tanto a
    llamadas del frontend hacia la API como a un service del backend
    llamando otro servicio/endpoint interno repetidamente.
  - Si de verdad se necesita repetir una llamada (ej. reintentos ante error
    de red), debe tener un límite explícito de intentos y backoff, nunca
    un loop abierto.

---

## 9. IDIOMA DEL CÓDIGO (OBLIGATORIO)

- **Todo el código va en inglés**: nombres de variables, funciones, clases,
  tipos/interfaces, archivos, carpetas, endpoints, y también los campos y
  nombres de tablas/columnas en la base de datos (`created_by`, `active`,
  `users`, `roles_modules`, etc. — nunca `creado_por`, `activo`, `usuarios`,
  `roles_modulos`).
- **La única excepción son los comentarios dentro del código**, que se
  quedan en español (como se ha hecho en todo este proyecto hasta ahora).
  Los comentarios no son código — son la explicación humana del código.
- El código debe quedar **bien comentado**: cuando una lógica no sea obvia
  a simple vista (una regla de negocio rara, un workaround, un motivo detrás
  de una decisión), se explica con un comentario en español. No hace falta
  comentar lo obvio.
- Esto aplica a **todo código nuevo** que se escriba de aquí en adelante
  (nuevos módulos, servicios, tablas, etc.). El código ya existente de
  auth/RBAC que sigue en español (`creado_por`, `rolId`, etc.) no se
  renombra retroactivamente salvo que se pida explícitamente — es un
  cambio mucho más grande y riesgoso que tocar módulos ya en uso.
- Ejemplo correcto:
  ```typescript
  // Bloqueamos la deshabilitación si es el último admin activo,
  // para no dejar el sistema sin nadie que pueda gestionar roles.
  export async function disableUserService(id: string): Promise<void> {
    const isLastAdmin = await checkIsLastActiveAdmin(id);
    if (isLastAdmin) throw new AppError(409, 'No puedes deshabilitar al último administrador');

    await db.user.update({ where: { id }, data: { active: false } });
  }
  ```

---

## 10. MULTI-TENANCY (MULTI-EMPRESA / MULTI-TIENDA) — OBLIGATORIO

El sistema es multi-tenant desde su base: **múltiples empresas distintas**
usan la misma instancia, cada una con **múltiples tiendas**, y su
información debe quedar **completamente separada** entre sí.

### Jerarquía fija
```
company (empresa / tenant — el límite real de aislamiento)
  └── business_unit (tienda/sucursal), FK company_id
        └── user, FK business_unit_id
```
- `company` ES el tenant. No hay otro nivel por encima.
- Un rol no-system pertenece a una empresa (`role.company_id`); un rol con
  `company_id = NULL` es un rol de **plataforma** (ej. Super Administrador,
  `is_system = true`) y ve/gestiona todas las empresas sin filtro.

### Reglas
- **Toda tabla de negocio nueva DEBE incluir `company_id`** (obligatorio) y,
  si el dato es específico de una tienda, `business_unit_id` (opcional).
- El `company_id`/`business_unit_id`/`isSystem` del usuario autenticado se
  derivan SIEMPRE en el backend a partir de la sesión (`req.user`, calculado
  por request desde BD, igual que los roles) — **nunca se confía en un
  `company_id` que mande el frontend** en el body/query de un request.
- Todo endpoint de listar/buscar filtra por `company_id` salvo que el
  usuario tenga un rol `is_system` (acceso de plataforma). Todo endpoint de
  crear/actualizar/deshabilitar valida que el registro objetivo pertenezca a
  la empresa del usuario (o que sea `is_system`) antes de tocarlo — nunca
  alcanza con filtrar solo el listado.
- Los catálogos compartidos de plataforma (`modules`, `resources`) son
  globales; solo un usuario `is_system` puede darlos de alta, editarlos o
  deshabilitarlos (middleware `requireSystemRole`). Una empresa solo puede
  otorgar/quitar accesos sobre ese catálogo compartido a sus propios roles.
- Dar de alta una empresa o una tienda nueva es una acción de plataforma
  (`requireSystemRole`), no algo que gestione una empresa sobre sí misma.

---

## 11.1 JERARQUÍA DE ROLES Y ALCANCE DE DATOS (OBLIGATORIO)

Todo módulo nuevo (RBAC, servicios de listar/crear/actualizar, UI) se
construye respetando esta jerarquía de 3 niveles. No es una convención de
un módulo puntual: es la regla de alcance de datos por defecto de TODO el
sistema.

### Niveles

1. **Super Administrador (`is_system = true`)**
   - Rol de plataforma, `company_id = NULL` (ya definido en sección 10).
   - Puede ver, crear, modificar y deshabilitar TODO, sin filtro de
     empresa ni de tienda. Es el único que gestiona empresas, tiendas y el
     catálogo compartido de `modules`/`resources`.

2. **Administrador de empresa (`role.company_id` seteado, sin
   restricción de `business_unit_id`)**
   - Ve, crea, modifica y deshabilita **todo lo de su propia empresa**
     (`company_id`), sin importar la tienda (`business_unit_id`) — es
     decir, todas las tiendas de su empresa.
   - Nunca ve ni puede tocar datos de otra empresa (regla ya cubierta en
     sección 10: todo endpoint valida `company_id` del actor).

3. **Gestor (usuario operativo, ligado a procesos — ej. cotizaciones,
   pagos — no a configuración)**
   - Por defecto, su alcance de datos queda limitado a **su propia
     `business_unit_id`** (la tienda que tiene asignada): solo ve/gestiona
     cotizaciones, pagos y cualquier dato operativo de SU tienda.
   - Existe un permiso explícito, a nivel de usuario o de rol
     (ej. `can_view_all_business_units: boolean`, o un botón/resource RBAC
     tipo `quotes.viewAllStores.button` — sección 2), que si está
     habilitado le permite **ver** (no necesariamente crear/modificar)
     los datos operativos de gestión (cotizaciones, pagos, y cualquier
     entidad de proceso equivalente) de **todas las tiendas de su
     empresa**. Este permiso amplía el alcance de lectura entre tiendas,
     nunca entre empresas.
   - Un gestor nunca gestiona configuración de la empresa (roles, módulos,
     usuarios, tiendas, catálogos) — eso es exclusivo de Administrador/
     Super Administrador. El alcance de un gestor es siempre sobre
     entidades de proceso/operación, nunca sobre configuración del
     sistema.

### Regla de implementación (obligatoria en cada service)

- El filtro de alcance se resuelve SIEMPRE en el backend, derivado del
  usuario autenticado (`req.user`: `isSystem`, `companyId`,
  `businessUnitId`, y el flag/permiso de "ver todas las tiendas") — nunca
  un `businessUnitId`/`companyId` que mande el frontend en query/body
  (mismo principio que sección 10 para `company_id`).
- Todo service de `list`/`get` de una entidad operativa (cotizaciones,
  pagos, y equivalentes) aplica, en este orden de prioridad, sin `if`
  anidados (guard clauses):
  1. Si `isSystem` → sin filtro (todas las empresas).
  2. Si es Administrador de la empresa → filtra solo por `company_id`.
  3. Si es Gestor con el permiso de "ver todas las tiendas" habilitado →
     filtra por `company_id` (todas las tiendas de esa empresa).
  4. Si es Gestor sin ese permiso → filtra por `company_id` **y**
     `business_unit_id` (solo su tienda asignada).
- Los endpoints de **crear/actualizar/deshabilitar** de entidades
  operativas SIEMPRE validan la tienda del registro objetivo contra la
  `business_unit_id` del gestor (salvo Administrador/Super Administrador)
  — el permiso de "ver todas las tiendas" es solo de lectura, nunca
  habilita escribir sobre una tienda ajena a la asignada, salvo que se
  otorgue explícitamente un permiso distinto para eso.
- El frontend (sección 7) refleja este alcance únicamente para UX
  (ej. mostrar u ocultar un selector de tienda en el filtro de la lista
  según `useAccess()`), nunca decide el filtrado real — el backend
  siempre revalida.

---

## 12. CÓDIGO MODERNO, TIPADO ESTRICTO, RENDIMIENTO Y ROLLBACK (OBLIGATORIO)

### Tipado estricto — cero `any`
- **Prohibido `any` en todo el proyecto**, backend y frontend, incluyendo
  `any` implícito, `as any`, `@ts-ignore`/`@ts-expect-error` para silenciar
  errores de tipos, y `Function`/`Object`/`{}` como tipo genérico "cajón de
  sastre". `tsconfig.json` debe tener `strict: true`,
  `noImplicitAny: true`, `noUncheckedIndexedAccess: true`.
- Si un tipo es genuinamente desconocido (ej. respuesta externa sin tipar),
  usar `unknown` + narrowing (type guards, `zod.parse`) — nunca `any` como
  atajo. Tipar siempre con interfaces/types explícitos: params, retorno de
  funciones, props de componentes, DTOs, resultados de queries.
- Preferir `type`/`interface` explícitos sobre inferencia implícita en
  fronteras públicas (exports, props, firmas de servicios/hooks) — la
  inferencia interna dentro de una función está bien, pero lo que cruza un
  módulo se tipa a mano.

### Código moderno / buenas prácticas
- Sintaxis moderna de TS/ES: `async/await` (nunca `.then` encadenado ni
  callbacks), optional chaining (`?.`), nullish coalescing (`??`),
  destructuring, template literals, `const`/`let` (nunca `var`).
- Funciones puras y pequeñas con una sola responsabilidad; evitar efectos
  secundarios ocultos. Nombres explícitos (nada de `data2`, `tmp`, `x`).
- Inmutabilidad por defecto: no mutar arrays/objetos recibidos por
  parámetro; usar spread/`map`/`filter`/`reduce` en vez de mutación directa.
- ESLint + Prettier configurados y respetados (reglas ya vigentes de
  no-any, no-unused-vars, exhaustive-deps en hooks de React). Ningún PR/
  cambio se entrega con errores de lint.

### Rendimiento y optimización (reafirma y extiende sección 8)
- Toda query nueva se piensa primero en términos de índice y de qué trae a
  memoria — nunca `SELECT *`/`findMany` sin filtro cuando hay alternativa
  paginada o filtrada (sección 4).
- Memorizar cálculos costosos en el frontend (`useMemo`/`useCallback`)
  solo cuando hay un costo real medible o se evita un re-render de una lista
  grande — no memorizar todo por costumbre (eso también es ruido/practica
  pobre).
- Evitar renders innecesarios: componentes de lista con `key` estable,
  `React.memo` en componentes puros que reciben las mismas props seguido,
  code-splitting (`React.lazy`/dynamic import) para vistas pesadas.
- Ningún endpoint bloquea el event loop con trabajo síncrono pesado
  (hashing costoso, parsing grande, loops CPU-intensivos) — mover a
  worker/cola si aplica (ya cubierto en sección 8).

### Rollback / transacciones (OBLIGATORIO)
- **Toda operación que escriba en más de una tabla, o que combine una
  escritura en DB con un efecto externo (llamada a otro servicio, envío de
  email, archivo), va envuelta en una transacción de DB
  (`db.$transaction`/`BEGIN...COMMIT` del ORM que se use).** Si algo falla a
  mitad de camino, la transacción hace rollback completo — nunca queda un
  estado a medias (ej. usuario creado sin su rol asignado).
- Dentro de una transacción, cualquier `AppError` lanzado revierte todo el
  bloque — no capturar el error dentro de la transacción para "seguir" sin
  relanzar.
- Para flujos multi-paso que cruzan sistemas externos (ej. crear registro
  local + llamar API externa), si el paso externo puede fallar después de
  confirmar el paso local, diseñar el flujo para que el paso externo vaya
  primero (o usar patrón "outbox"/compensación explícita) — nunca dejar el
  registro local confirmado si el efecto externo correspondiente falló sin
  compensación.
- El frontend refleja el mismo principio a nivel de UX: mutaciones que
  afectan múltiples recursos relacionados se disparan como una sola
  operación de backend (un solo endpoint transaccional), nunca como varias
  llamadas sueltas desde el cliente que puedan quedar parcialmente
  aplicadas si una falla a la mitad.

### Seguridad (reafirma reglas ya vigentes)
- Validación de entrada SIEMPRE con Zod en el borde (backend: body/query/
  params; frontend: formularios) — nunca confiar en datos del cliente sin
  validar de nuevo en el backend (ya cubierto en sección 10 para
  `company_id`, aplica igual a cualquier campo sensible).
- Nunca interpolar valores en queries SQL crudas (usar el ORM o
  parámetros bindeados). Nunca loguear contraseñas, tokens ni datos
  sensibles completos (mask/redact en logs).
- Sanitizar cualquier output que se renderice como HTML en el frontend
  (evitar `dangerouslySetInnerHTML` salvo con sanitización explícita).

### Reutilización de componentes sin romper lo existente (OBLIGATORIO)
- Antes de modificar un componente compartido (`components/shared/`,
  `components/ui/`, un hook reutilizado, un helper de `core/utils`), el
  agente hace `grep` de **todos** los usos existentes y revisa cada uno
  para confirmar que el cambio no rompe su comportamiento actual — un
  componente compartido no se cambia "para el caso nuevo" si eso degrada
  o rompe un caso viejo.
- Si un cambio en un componente compartido requiere comportamiento
  distinto según el caller, se resuelve con **props opcionales con default
  que preservan el comportamiento anterior** (nunca cambiando el default
  existente ni el tipo de una prop ya usada en otros lugares) — si el
  cambio es incompatible de verdad, se crea una variante nueva
  (`ComponentNameV2` o un componente separado) en vez de forzarlo dentro
  del mismo componente para todos los casos.
- Cambios de firma (props, parámetros de hook, tipos exportados) que
  afecten a más de un caller se hacen en el mismo commit para todos los
  callers — nunca se deja un caller roto o con `// TODO: actualizar
  después`.
- Después de tocar un componente/hook/util compartido, correr type-check
  (`tsc --noEmit`) del proyecto completo (no solo del archivo tocado) para
  confirmar que ningún consumidor quedó con tipos rotos.

---

## 13. INSTRUCCIONES ESPECÍFICAS PARA EL AGENTE (Claude Code)

- Al crear un módulo nuevo: generar SIEMPRE las 3 carpetas
  (`controllers/`, `services/`, `routers/`) + `validators/` + `types/` +
  `README.md`, con un archivo por acción. Nunca meter dos acciones en un
  archivo aunque parezcan triviales.
- Al crear cualquier endpoint nuevo: registrarlo en `resources` (tabla RBAC)
  y en el `README.md` del módulo en el mismo cambio — no dejarlo para
  "después".
- Al crear cualquier tabla nueva: incluir los 4 campos de auditoría desde
  la migración inicial, sin excepción.
- Al crear cualquier endpoint de listado: implementar paginación desde el
  primer commit, no como mejora posterior.
- Nunca escribir `if (a) { if (b) { ... } }`. Usar guard clauses,
  early return, o extraer a una función con nombre que explique la
  condición compuesta.
- Nunca decidir permisos de rol en el frontend. Toda decisión de acceso se
  valida en el backend vía `authorize(MODULE)`.
- Seguir usando `dateUtils.ts` para toda fecha/hora — nunca conversión de
  zona horaria manual inline (regla ya definida antes, sigue aplicando
  también dentro de los services de cada módulo).
- No instalar librerías nuevas sin que estén ya aprobadas en este archivo,
  salvo pregunta previa.
- Librerías del backend aprobadas por el usuario en el Sprint 2 (decisión
  D16, 12-nov-2026): **SheetJS CE `xlsx` 0.20.3** instalada desde
  `https://cdn.sheetjs.com` (el paquete de npm está abandonado) para leer los
  Excel de stock de proveedores, siempre dentro de un `worker_thread`;
  **xml-crypto**, **node-forge**, **fflate** y **qrcode** para la guía de
  remisión electrónica (se instalan cuando se llegue a ese ítem).
- Todo código nuevo (variables, campos, tablas, endpoints) va en inglés,
  con comentarios en español — ver sección 9.
- Al crear cualquier tabla nueva: incluir `company_id` (y `business_unit_id`
  si aplica) desde la migración inicial — ver sección 10. Al crear
  cualquier service de listar/buscar/crear/actualizar: filtrar o validar por
  la empresa del usuario autenticado, salvo `is_system`.
- Nunca responder un error a mano con `res.status().json()` en un
  controller/service — siempre `throw new AppError(...)` y dejar que lo
  capture el `errorHandler` central (sección 5).
- Frontend nuevo va en React + TS + Tailwind + shadcn/ui (sección 7) —
  nunca Bootstrap/Metronic/react-bootstrap en código nuevo. Todo fetch de
  datos vía React Query (hook por operación), nunca `useEffect` manual.
- Todo módulo nuevo de frontend agrega su entrada a `menuConfig.ts` con el
  mismo `moduleCode` registrado en `resources` del backend — el menú es
  una sola estructura para todos los roles, filtrada por `useAccess()`,
  nunca un sidebar distinto hardcodeado por rol.
- Antes de construir una pantalla o botón nuevo, buscar primero cómo ya
  está resuelto en otra pantalla del mismo tipo (sección 7 —
  "Consistencia entre vistas") y reutilizar ese mismo patrón/componente en
  vez de crear una variante nueva. Si se detecta que varias pantallas
  repiten el mismo bloque de JSX (ej. un botón de acción, una fila de
  tabla), extraerlo a `components/shared/` y actualizar TODAS las
  pantallas que lo usan en el mismo cambio — nunca dejar una migrada a
  medias.
