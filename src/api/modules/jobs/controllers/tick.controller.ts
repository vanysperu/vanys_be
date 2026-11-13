import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { expireOverdueQuotations } from "../../quotation/services/jobs/expireQuotations.job";
import { retryPendingDriveCopies } from "../../invoice/services/shared/drive_copy";
import { dispatchPendingEmails } from "../../email/services/outbox/dispatch.service";
import { refreshDueStockSources } from "../../supplier_stock/services/jobs/refresh_due_sources.job";

// Corre una tarea sin que su error frene a las demás.
const safely = async <T>(name: string, task: () => Promise<T>): Promise<T | { error: string }> => {
  try {
    return await task();
  } catch (error: unknown) {
    console.error(`[jobs/tick] Falló "${name}":`, error);
    return { error: error instanceof Error ? error.message : "Error desconocido" };
  }
};

// POST /api/internal/jobs/tick — lo llama el cron de hPanel cada 10 minutos
// con la cabecera X-Cron-Secret (plan del Sprint 2, sección 3.5). En Hostinger
// la app se apaga sin tráfico y los timers internos no corren: este request la
// despierta y pone al día todas las tareas pendientes. Cada tarea es
// idempotente, así que correrlas de más no cambia nada.
export const jobsTickController = asyncHandler(async (_req: Request, res: Response) => {
  const emails = await safely("emails", dispatchPendingEmails);
  const expiredQuotations = await safely("expire-quotations", expireOverdueQuotations);
  const driveCopies = await safely("drive-retry", retryPendingDriveCopies);
  // Stock de proveedores (Sprint 2, ítem 6): las fuentes cuya lectura venció.
  const supplierStock = await safely("supplier-stock", refreshDueStockSources);
  ok(res, 200, { emails, expiredQuotations, driveCopies, supplierStock }, "Tareas programadas ejecutadas");
});
