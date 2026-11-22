# Módulo: tutorial (modo enseñanza, "Aprender")

Lecciones guiadas tipo videojuego. Cada paso ilumina una zona de la pantalla y bloquea el resto. La lección espera
a que la persona haga la acción real (abrir, llenar, guardar) para seguir. Pedido del usuario del 21-nov-2026.

Las lecciones (los pasos de pantalla) viven en el frontend: `grulla_fe/src/modules/tutorial/lessons/`. Este módulo
guarda el avance y maneja la **empresa de práctica**.

## Código de módulo (RBAC)
`tutorial` (seeder `20261121100800-seed-tutorial-module.js`).
- Lo recibe todo rol de empresa (otorgado como `inicio.view`).
- Los roles nuevos lo reciben por `DEFAULT_RESOURCE_CODES` (`role.services.ts`).
- "Avance del equipo" es solo para administradores (otorgado como `payment.update.button`).

## Endpoints
| Método | Ruta | Acción | Recurso RBAC |
|--------|------|--------|--------------|
| POST | /tutorial/practice/start | Entrar a la empresa de práctica (la crea la primera vez); devuelve la sesión del usuario de práctica | tutorial.practice.start.endpoint |
| POST | /tutorial/practice/reset | Reiniciar la práctica: la actual se deshabilita (soft) y se crea una nueva con los ejemplos | tutorial.practice.reset.endpoint |
| POST | /tutorial/practice/prepare | Dejar lista una cotización para una lección (`pending_quotation` / `accepted_quotation`); solo dentro de la práctica | tutorial.practice.prepare.endpoint |
| GET | /tutorial/progress | Avance de la persona real | tutorial.progress.list.endpoint |
| PUT | /tutorial/progress/:code | Guardar el paso seguro o la lección completada | tutorial.progress.save.endpoint |
| GET | /tutorial/team-progress | Avance del equipo, paginado | tutorial.teamProgress.button |

## Vistas de frontend vinculadas
- `tutorial.view` → `/aprender` (menú, después de Recordatorios).

## Botones/acciones vinculadas
- `tutorial.teamProgress.button`: tabla "Avance del equipo" en `/aprender`.

## Reglas de negocio
- **Empresa de práctica por persona.**
  - Cada persona practica en su propia empresa: `company.is_practice = true`, con `practice_of_company_id` = su
    empresa real.
  - Usa un usuario de práctica propio: `user.practice_of_user_id` = la persona real, a lo más uno por persona.
  - Como es otra empresa, todo el aislamiento multiempresa (§10) ya aplica: nada de la práctica toca la empresa real.
- **El usuario de práctica:**
  - Tiene los mismos roles que la persona real, así un gestor practica como gestor.
  - Su contraseña es aleatoria y nadie la conoce: no entra por login.
  - Su sesión la abre `/practice/start`, igual que `/signin` (tabla `token` + JWT). Solo cierra las sesiones de
    práctica anteriores; la de la cuenta real queda intacta.
  - Su correo termina en `@practica.invalid`, un dominio reservado que nunca recibe correos.
- **Ejemplos de cada empresa de práctica** (`sample_catalog.service.ts`):
  - 3 clientes, 3 productos (2 con personalización), 3 técnicas y una cuenta BCP con CCI;
  - la tienda `PRACTICA`;
  - un RUC inventado que empieza en 9.
- **No se mezcla con las empresas reales.** Las empresas de práctica no salen en:
  - la lista de empresas;
  - las tiendas ni los usuarios del Super Administrador sin empresa elegida;
  - las estadísticas de plataforma;
  - Caja sin empresa elegida (`core/rbac/practiceScope.ts`).
- **El avance es siempre de la persona real** y de su empresa real, aunque practique con el usuario de práctica.
  Una lección completada queda completada aunque se repita.
- `prepare` usa los servicios normales del sistema (`createQuotation`, `changeQuotationStatus`, con la mitad de
  adelanto en efectivo). Así cada lección se puede hacer en cualquier orden y repetir.

## Campos especiales
- `tutorial_progress`: `status` (`in_progress` | `completed`), `step_index` y `completed_at`.
  - Única por (`user_id`, `lesson_code`).
  - Al salir, `completed_at` va en `{ date, time }` (UTC-5).
- Migración `20261121100400-tutorial-practice-mode.js`.
