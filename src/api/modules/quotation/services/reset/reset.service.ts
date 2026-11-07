import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { formatSoles, fromCents } from "../../../../../core/utils/money";
import { nowUtc } from "../../../../../utils/dateUtils";
import { reconcileInvoiceAfterRemoval } from "../../../invoice/services/shared/purchase_invoice_link";
import { createLogService } from "../../../logs/services/create/log.services";
import { LogAction } from "../../../logs/model/log.model";
import { computeDefaultValidUntil } from "../create/quotation.service";
import { getOrderedProductionStages } from "../shared/production_stages";
import { logQuotationEvent, truncateForTimeline } from "../timeline/quotation_event.service";
import { QuotationResetResult, QuotationResetSummary, ResetMoneyLine } from "../../types/reset.types";
import { loadResetPlan, QuotationResetPlan, resetBlockOf } from "./reset_plan";

const quotationCode = (id: number) => `COT-${String(id).padStart(4, "0")}`;

// Solo nombres fijos de este archivo, nunca un valor del usuario.
type ResetTable =
  | "cash_adjustment_entry"
  | "money_correction"
  | "invoice"
  | "invoice_purchase"
  | "employee_debt_payment_allocation"
  | "employee_debt_payment"
  | "employee_debt"
  | "purchase_order_item_purchase"
  | "purchase_order_item"
  | "cash_movement"
  | "purchase_order"
  | "quotation_expense"
  | "quotation_payment";

const deleteRows = async (table: ResetTable, column: string, ids: readonly number[], transaction: Transaction): Promise<void> => {
  if (ids.length === 0) return;
  await DataBase.instance.sequelize.query(`DELETE FROM ${table} WHERE ${column} IN (:ids)`, { replacements: { ids }, transaction });
};

// Reposiciones: la que solo cubría estas deudas se borra; la que cubría otras
// se queda con lo que corresponde a esas (el invariante "suma de asignaciones =
// monto" sigue valiendo y las otras deudas siguen pagadas).
const removeReimbursements = async (plan: QuotationResetPlan, actorId: number, transaction: Transaction): Promise<void> => {
  await deleteRows("employee_debt_payment_allocation", "employee_debt_id", plan.debtIds, transaction);
  const deleted = plan.reimbursements.filter((row) => row.deletesPayment).map((row) => row.id);
  await deleteRows("employee_debt_payment", "id", deleted, transaction);

  for (const reimbursement of plan.reimbursements.filter((row) => !row.deletesPayment)) {
    await DataBase.instance.sequelize.query(
      "UPDATE employee_debt_payment SET amount = amount - :removed, updated_by = :actorId, updated_at = :now WHERE id = :id",
      {
        replacements: { removed: fromCents(reimbursement.removedCents), actorId, now: nowUtc(), id: reimbursement.id },
        transaction,
      }
    );
  }
};

// De hijos a padres, respetando las llaves foráneas. Las facturas primero: sus
// vínculos apuntan a las compras.
const deletePlanRows = async (plan: QuotationResetPlan, actorId: number, transaction: Transaction): Promise<void> => {
  await deleteRows("cash_adjustment_entry", "money_correction_id", plan.correctionIds, transaction);
  await deleteRows("money_correction", "id", plan.correctionIds, transaction);

  await deleteRows("invoice", "id", plan.issuedInvoiceIds, transaction);
  await deleteRows("invoice_purchase", "purchase_id", plan.purchaseIds, transaction);
  for (const invoiceId of plan.purchaseInvoiceIds) {
    await reconcileInvoiceAfterRemoval({ invoiceId, keepIfHasFile: false, actorId, transaction });
  }

  await removeReimbursements(plan, actorId, transaction);
  await deleteRows("employee_debt", "id", plan.debtIds, transaction);
  await deleteRows("purchase_order_item_purchase", "id", plan.purchaseIds, transaction);
  await deleteRows("purchase_order_item", "id", plan.orderItemIds, transaction);
  await deleteRows("cash_movement", "id", plan.cashMovementIds, transaction);
  await deleteRows("purchase_order", "id", plan.orderIds, transaction);
  await deleteRows("quotation_expense", "id", plan.expenseIds, transaction);
  await deleteRows("quotation_payment", "id", plan.paymentIds, transaction);
};

const moneyText = (label: string, line: ResetMoneyLine): string[] =>
  line.count > 0 ? [`${line.count} ${label} (${formatSoles(line.total)})`] : [];

// Lo borrado, en texto: es el único rastro que queda de esas filas.
const summaryText = (summary: QuotationResetSummary): string => {
  const parts = [
    ...moneyText("pago(s)", summary.payments),
    ...moneyText("gasto(s)", summary.expenses),
    ...moneyText("compra(s)", summary.purchases),
    ...(summary.purchase_orders > 0 ? [`${summary.purchase_orders} orden(es) de compra`] : []),
    ...moneyText("deuda(s) con trabajadores", summary.debts),
    ...moneyText("reposición(es)", summary.reimbursements),
    ...moneyText("movimiento(s) de caja", summary.cash_movements),
    ...(summary.invoices_deleted > 0 ? [`${summary.invoices_deleted} factura(s)`] : []),
  ];
  return parts.length > 0 ? parts.join(", ") : "nada que borrar";
};

/**
 * Resetea una cotización (solo Super Administrador, pedido explícito del
 * usuario): vuelve a Pendiente con sus productos y precios, y se borra
 * FÍSICAMENTE todo lo que generó: pagos, gastos, órdenes de compra, compras,
 * deudas con trabajadores, reposiciones, facturas, movimientos de caja
 * vinculados y sus correcciones. Es la única excepción a "nunca borrar dinero":
 * no se puede deshacer, por eso exige motivo y queda en el historial de la
 * cotización y en el log.
 *
 * Todo en UNA transacción: si algo falla, no se borra nada. Se niega si toca un
 * mes de caja cerrado (ver resetBlockOf). El historial de la cotización se
 * conserva: es el único rastro de lo que pasó. Lo copiado a Google Drive no se
 * toca nunca.
 */
export async function resetQuotation({
  quotationId,
  reason,
  actorId,
}: {
  quotationId: number;
  reason: string;
  actorId: number;
}): Promise<QuotationResetResult> {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const plan = await loadResetPlan(quotationId, transaction);
    const block = resetBlockOf(plan);
    if (block) throw block;

    await deletePlanRows(plan, actorId, transaction);

    // Vigencia nueva: con la vieja, si ya pasó, el job la vencería esa noche.
    const now = nowUtc();
    const validUntil = await computeDefaultValidUntil(now, plan.companyId);
    await DataBase.instance.quotation.update(
      { status: "pending", status_changed_at: now, total_paid: 0, valid_until: validUntil, updated_by: actorId, updated_at: now },
      { where: { id: quotationId }, transaction }
    );
    // Cada producto vuelve a la primera etapa, como en una cotización nueva.
    const stages = await getOrderedProductionStages(plan.companyId, transaction);
    await DataBase.instance.quotation_item.update(
      { stage_id: stages[0]?.id ?? null, updated_by: actorId, updated_at: now },
      { where: { quotation_id: quotationId }, transaction }
    );

    const trimmedReason = reason.trim();
    const deleted = summaryText(plan.summary);
    const kept = plan.summary.invoices_kept > 0 ? ` Se conservó ${plan.summary.invoices_kept} factura(s) que cubre(n) otras compras.` : "";
    await logQuotationEvent({
      quotationId,
      action: "quotation_reset",
      description: `Cotización reseteada a Pendiente. Se eliminó: ${deleted}.${kept} Motivo: ${truncateForTimeline(trimmedReason)}`,
      actorId,
      transaction,
    });
    await createLogService(
      {
        user_id: actorId,
        action: LogAction.DELETE,
        module: "quotation",
        description: `Reseteó ${quotationCode(quotationId)} (estado anterior: ${plan.status}). Se eliminó: ${deleted}.${kept} Motivo: ${trimmedReason}`,
        company_id: plan.companyId,
      },
      transaction
    );

    return { id: quotationId, status: "pending", valid_until: validUntil, summary: plan.summary };
  });
}
