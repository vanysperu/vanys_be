import { QuotationResetPreview } from "../../types/reset.types";
import { loadResetPlan, resetBlockOf } from "./reset_plan";

// Qué se borraría al resetear y si se puede. Solo lee: el reset lo vuelve a
// calcular con las filas bloqueadas.
export async function getQuotationResetPreview(quotationId: number): Promise<QuotationResetPreview> {
  const plan = await loadResetPlan(quotationId);
  const block = resetBlockOf(plan);
  return {
    quotation_id: quotationId,
    quotation_code: `COT-${String(quotationId).padStart(4, "0")}`,
    status: plan.status,
    summary: plan.summary,
    can_reset: block === null,
    blocked_reason: block?.message ?? null,
    blocked_periods: plan.blockedPeriods,
  };
}
