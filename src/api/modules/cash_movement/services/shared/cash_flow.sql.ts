// Qué es dinero que REALMENTE entra o sale de la empresa. Caja y Estadísticas
// usan exactamente estos fragmentos (texto fijo del código, nunca valores
// del usuario), para que sus totales cuadren siempre.

// Un gasto de cotización (alias `qe`) mueve la caja de la empresa salvo que
// sea una compra pagada con plata de un trabajador: ahí la empresa no soltó
// nada todavía — su egreso es la reposición.
export const EXPENSE_FUNDING_JOIN_SQL = "LEFT JOIN purchase_order_item_purchase fpop ON fpop.quotation_expense_id = qe.id";
export const EXPENSE_PAID_BY_COMPANY_SQL = "(fpop.id IS NULL OR fpop.funding_source = 'company')";

// Un gasto (o compra) anulado deja de existir para el dinero: ni Caja, ni
// Estadísticas, ni el margen lo cuentan. TODA consulta que lea
// quotation_expense (alias `qe`) debe incluir este filtro.
export const EXPENSE_ACTIVE_SQL = "qe.is_deleted = false";

// Reposiciones a trabajadores (alias `p`), una fila por asignación (`a`) a
// cada deuda (`ed`). La tienda de cada parte es la de la cotización de la
// compra o, en una deuda manual, la de la propia deuda: así una reposición
// que cubre compras de dos tiendas se reparte entre ambas.
export const REIMBURSEMENT_ALLOCATIONS_FROM_SQL = `employee_debt_payment p
  INNER JOIN employee_debt_payment_allocation a ON a.employee_debt_payment_id = p.id
  INNER JOIN employee_debt ed ON ed.id = a.employee_debt_id
  LEFT JOIN purchase_order_item_purchase rpop ON rpop.id = ed.purchase_order_item_purchase_id
  LEFT JOIN purchase_order_item rpoi ON rpoi.id = rpop.purchase_order_item_id
  LEFT JOIN purchase_order rpo ON rpo.id = rpoi.purchase_order_id
  LEFT JOIN quotation rq ON rq.id = rpo.quotation_id`;

export const REIMBURSEMENT_SCOPE_SQL = `p.is_deleted = false
  AND (:companyId IS NULL OR p.company_id = :companyId)
  AND (:businessUnitId IS NULL OR COALESCE(rq.business_unit_id, ed.business_unit_id) = :businessUnitId)`;

// Patas de ajuste del cierre de caja (alias `e`, tabla cash_adjustment_entry),
// con su corrección padre (`mc`, motivo y valores) y la cuenta (`pa`). Cada
// lector (Caja, Estadísticas, cierres) agrega sus filtros de fecha, sentido,
// cotización, orden o cuenta sobre `e`.
export const ADJUSTMENT_ENTRY_FROM_SQL = `cash_adjustment_entry e
  INNER JOIN money_correction mc ON mc.id = e.money_correction_id
  LEFT JOIN general_variable pa ON pa.id = e.payment_account_id`;

// Mismo alcance de empresa/tienda que el resto de las fuentes. La tienda de
// una pata es la de su efecto original (en una reposición, la de cada
// asignación), así Caja filtrada por tienda sigue cuadrando.
export const ADJUSTMENT_ENTRY_SCOPE_SQL = `(:companyId IS NULL OR e.company_id = :companyId)
  AND (:businessUnitId IS NULL OR e.business_unit_id = :businessUnitId)`;
