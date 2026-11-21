# Módulo: loan (Préstamos a personas)

Pedido del usuario (21-nov-2026): "un módulo simple de préstamos a personas: cuando la empresa realiza un
préstamo y podría cobrar interés; a quién se le prestó, cuánto y qué % de interés". Decisión del usuario:
**simple + cobros + Caja**.

## Código de módulo (RBAC)
`loan` — vista `loan.list` (`/prestamos`, grupo Finanzas, ícono `banknote`). Seeder
`20261121100700-seed-loan-module.js`: lo reciben los roles que ya ven "Deudas a personal"
(`employee_debt.list`), es decir los administradores. Nunca el Gestor. El Super Administrador ya tiene todo.

## Endpoints
| Método | Ruta                                | Acción                          | Recurso RBAC                  |
|--------|-------------------------------------|---------------------------------|-------------------------------|
| GET    | /loan/list                          | list (paginado, con resumen)    | loan.list.endpoint            |
| GET    | /loan/find/:id                      | detalle + cobros                | loan.find.endpoint            |
| POST   | /loan/create                        | create                          | loan.create.button            |
| PUT    | /loan/update/:id                    | update                          | loan.update.button            |
| PUT    | /loan/disable/:id                   | disable (anular / restaurar)    | loan.disable.button           |
| POST   | /loan/:id/payment                   | registrar cobro                 | loan.payment.create.button    |
| PUT    | /loan/payment/disable/:paymentId    | anular cobro                    | loan.payment.disable.button   |

Filtros del listado: `status` (`pending`, `overdue`, `paid`, `annulled`; sin estado = vigentes), `search`
(nombre o documento), `dateFrom`/`dateTo` (fecha del préstamo), `companyId` (solo Super Administrador).

## Vistas de frontend vinculadas
- loan.list (`/prestamos`)

## Botones/acciones vinculadas
- loan.create.button
- loan.update.button
- loan.disable.button
- loan.payment.create.button
- loan.payment.disable.button

## Reglas de negocio propias del módulo
- **Interés simple, una sola vez** sobre el capital: `interest_amount = capital × % / 100`;
  `total_due = capital + interés` (CHECK en la base).
- **Saldo** = `total_due − cobros vigentes`. Estado calculado: `pending`, `overdue` (vencido y con saldo),
  `paid` (saldo 0) o `annulled`.
- **Cobro**: nunca mayor que el saldo ni anterior a la fecha del préstamo. Se reparte en capital e interés
  **en proporción** al total (`interés = monto × interés / total`); el cobro que deja el saldo en 0 se lleva
  lo que falte de interés (la suma de intereses es exacta, sin céntimos sueltos).
- El **capital, el %, la fecha y la cuenta** solo se corrigen si el préstamo no tiene cobros vigentes (si no,
  el reparto ya hecho quedaría descuadrado). Los datos de la persona, el vencimiento y las notas, siempre.
- **Anular** un préstamo exige que no tenga cobros vigentes; anular un cobro es de una sola vía (si hacía
  falta, se vuelve a registrar). Todo es soft (`active = false`).
- **Mes de caja cerrado**: ni el préstamo ni sus cobros se registran, cambian o anulan en un mes cerrado
  (mismo protocolo de candados que las transferencias).
- **Alcance**: empresa y tienda salen de la sesión. Un usuario con tienda propia solo ve y escribe préstamos
  de su tienda; un admin sin tienda elige la tienda al crear.
- Cada escritura deja un log (`module = "loan"`) en la misma transacción.

## Caja y Estadísticas
- Caja (fuente `loan`): la **salida** del día del préstamo (egreso de la cuenta elegida) y, por cada cobro,
  el **capital** devuelto y el **interés** como filas separadas (`loan.part`).
- El **capital** (prestado y devuelto) mueve el saldo de la cuenta pero **no es ingreso ni egreso**: va al
  apartado `transfers` del resumen, igual que una transferencia entre cuentas. Así los cierres de caja
  (`cierre = inicial + ingresos − egresos + transferencias + ajustes`) siguen cuadrando sin cambios.
- El **interés cobrado sí es ingreso**: suma en Caja, en el resultado del mes y en Estadísticas
  (tendencia, "Otros ingresos" y la categoría "Intereses de préstamos"). Fragmentos SQL compartidos en
  `cash_movement/services/shared/cash_flow.sql.ts` (`LOAN_*`).
- Las filas de préstamos no se corrigen desde Caja (no tienen historial en `money_correction`): se corrigen
  en Préstamos.

## Campos especiales
- `loaned_at`, `due_date`, `paid_at`: DATE (sin hora). `createdAt` sale como `{ date, time }` (hora de Lima).
- `payment_account_id`: cuenta de la empresa por la que salió/entró el dinero; `null` = efectivo.

## Pruebas
`tests/loan.test.ts`: permisos (Gestor 403, otra empresa 404), interés y reparto (incluido el redondeo en
tres cobros), saldo y estados, Caja (salida, capital, interés y resumen), resultado del mes, correcciones y
anulaciones con y sin cobros, filtros y resumen del listado.
