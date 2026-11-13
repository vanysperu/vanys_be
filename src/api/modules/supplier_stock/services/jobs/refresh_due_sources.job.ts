import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { runSourceImport, isImportRunning } from "../import/run_import";

// Por cada llamada del cron se actualizan pocas fuentes: el tick no puede
// tardar minutos (Hostinger corta el request) y la próxima sigue con el resto.
const SOURCES_PER_TICK = 3;

// Fuentes con enlace cuya última lectura buena ya venció (refresh_minutes) y
// cuya empresa sigue teniendo la funcionalidad. Lo llama /internal/jobs/tick.
export const refreshDueStockSources = async (): Promise<{ refreshed: number; failed: number }> => {
  const enabledCompanies = await DataBase.instance.company_feature.findAll({
    where: { feature_code: "supplier_stock", enabled: true },
    attributes: ["company_id"],
  });
  const companyIds = enabledCompanies.map((row) => Number(row.company_id));
  if (companyIds.length === 0) return { refreshed: 0, failed: 0 };

  const candidates = await DataBase.instance.supplier_stock_source.findAll({
    where: { company_id: { [Op.in]: companyIds }, active: true, source_type: "url", url_encrypted: { [Op.ne]: null } },
    order: [["last_success_at", "ASC"]],
  });
  const now = Date.now();
  const due = candidates
    .filter((source) => !isImportRunning(source))
    .filter((source) => !source.last_success_at || now - new Date(source.last_success_at).getTime() >= source.refresh_minutes * 60_000)
    // Una fuente que viene fallando no se reintenta en cada tick.
    .filter((source) => source.last_status !== "error" || now - new Date(source.updated_at ?? source.created_at).getTime() >= 60 * 60_000)
    .slice(0, SOURCES_PER_TICK);

  let refreshed = 0;
  let failed = 0;
  for (const source of due) {
    try {
      await runSourceImport({ source, trigger: "schedule", actorId: null });
      refreshed += 1;
    } catch (error: unknown) {
      // El error ya quedó en la fuente y en su historial.
      failed += 1;
      console.error(`[supplier-stock] La fuente ${source.id} no se pudo actualizar:`, error instanceof Error ? error.message : error);
    }
  }
  return { refreshed, failed };
};
