// Qué es dinero que REALMENTE entra o sale de la empresa. Caja y Estadísticas
// usan exactamente estos fragmentos (texto fijo del código, nunca valores
// del usuario), para que sus totales cuadren siempre.

// Un gasto de cotización (alias `qe`) mueve la caja de la empresa salvo que
// sea una compra pagada con plata de un trabajador: ahí la empresa no soltó
// nada todavía — su egreso es la reposición.
export const EXPENSE_FUNDING_JOIN_SQL = "LEFT JOIN purchase_order_item_purchase fpop ON fpop.quotation_expense_id = qe.id";
export const EXPENSE_PAID_BY_COMPANY_SQL = "(fpop.id IS NULL OR fpop.funding_source = 'company')";

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
