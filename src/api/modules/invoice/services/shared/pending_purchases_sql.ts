// Compras de la bandeja "Compras sin factura" (Sprint 2, ítem 3). Texto fijo de
// este archivo; los valores van siempre bindeados (:companyId, :businessUnitId...).
// La tienda de una compra es la de su cotización (igual que en el resto de compras).
export const PENDING_PURCHASES_FROM = `
  FROM purchase_order_item_purchase pop
  INNER JOIN purchase_order_item poi ON poi.id = pop.purchase_order_item_id
  INNER JOIN purchase_order po ON po.id = poi.purchase_order_id
  INNER JOIN quotation q ON q.id = po.quotation_id`;

export interface PendingScope {
  companyId: number | null;
  businessUnitId?: number;
  includeNotRequired?: boolean;
}

// Alcance base: compras vigentes (una anulada nunca aparece) de la empresa y,
// si el usuario está atado a una tienda, solo de esa tienda.
export const pendingScopeConditions = (scope: PendingScope): string[] => [
  "pop.is_deleted = false",
  scope.includeNotRequired ? "pop.invoice_status IN ('pending', 'not_required')" : "pop.invoice_status = 'pending'",
  "(:companyId IS NULL OR po.company_id = :companyId)",
  ...(scope.businessUnitId !== undefined ? ["q.business_unit_id = :businessUnitId"] : []),
];
