import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { logQuotationEvent } from "../timeline/quotation_event.service";
import { getOrderedProductionStages } from "../shared/production_stages";
import { InvalidTransitionError } from "./quotation.service";
import { VariableGeneralModel } from "../../../variable_general/models/variable_general.model";
import { ProductAttributes } from "../../../product/model/product.model";

// El `include: [{ association: "product" }]` no está declarado en
// `QuotationItemModel` (misma limitación de tipos de Sequelize con
// asociaciones que en el resto del proyecto).
type ItemWithProduct = { product?: Pick<ProductAttributes, "name"> | null };

// Las etapas de producción son configurables por empresa (filas de
// general_variable, no un enum fijo), así que "no saltarse el flujo" se
// valida por posición relativa: solo se puede mover a la etapa inmediatamente
// anterior o siguiente dentro del orden de esa empresa — igual principio que
// el estado de la cotización, aplicado a una lista que el propio admin define
// desde "Variables Generales".
const changeItemStage = async ({
  itemId,
  nextStageId,
  updatedBy,
}: {
  itemId: number;
  nextStageId: number;
  updatedBy?: number;
}) => {
  const item = await DataBase.instance.quotation_item.findOne({ where: { id: itemId }, include: [{ association: "product" }] });
  if (!item) throw new Error("El item no existe");

  const quotation = await DataBase.instance.quotation.findOne({ where: { id: item.quotation_id } });
  if (!quotation) throw new Error("La cotización no existe");

  const stages = await getOrderedProductionStages(quotation.company_id);

  const currentStageId = item.stage_id;
  const currentIndex = stages.findIndex((stage: VariableGeneralModel) => stage.id === currentStageId);
  const nextIndex = stages.findIndex((stage: VariableGeneralModel) => stage.id === nextStageId);

  if (nextIndex === -1) throw new Error("La etapa indicada no existe para esta empresa");

  const isAdjacent = currentIndex === -1 ? nextIndex === 0 : Math.abs(nextIndex - currentIndex) === 1;
  if (!isAdjacent) {
    throw new InvalidTransitionError(
      "Solo puedes mover un producto a la etapa inmediatamente anterior o siguiente — no se puede saltar etapas."
    );
  }

  // Escribe en 2 tablas (quotation_item, quotation_event) — todo o nada.
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    const result = await DataBase.instance.quotation_item.update(
      { stage_id: nextStageId, updated_by: updatedBy, updated_at: nowUtc() },
      { where: { id: itemId }, transaction }
    );

    await logQuotationEvent({
      quotationId: item.quotation_id,
      action: "item_stage_changed",
      description: `"${(item as unknown as ItemWithProduct).product?.name ?? 'Producto'}" pasó a la etapa "${stages[nextIndex]?.name}"`,
      actorId: updatedBy,
      transaction,
    });

    return result;
  });
};

export { changeItemStage };
