import { Transaction } from "sequelize";
import { getActiveStages } from "../../../production_workflow/services/shared/workflow_store";

// Columnas ACTIVAS del flujo de producción de la empresa, en orden (Sprint 2,
// ítem 5: cada empresa configura las suyas en "Flujo de producción"; antes
// eran filas de general_variable). Los que crean productos en una cotización
// solo usan la primera (`stages[0]`) como etapa inicial.
export const getOrderedProductionStages = async (companyId: number, transaction?: Transaction) =>
  getActiveStages(companyId, transaction);
