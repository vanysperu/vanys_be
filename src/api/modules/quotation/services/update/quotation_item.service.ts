import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { AppError } from "../../../../../core/errors/AppError";
import { logQuotationEvent } from "../timeline/quotation_event.service";
import { assertQuotationIsActive } from "../shared/active_quotation";
import { InvalidTransitionError } from "./quotation.service";
import { ProductAttributes } from "../../../product/model/product.model";
import { ensureCompanyWorkflow } from "../../../production_workflow/services/shared/workflow_store";
import { assertMoveAllowed, StageMoveNotAllowedError } from "../../../production_workflow/services/shared/stage_rules";

// El `include: [{ association: "product" }]` no está declarado en
// `QuotationItemModel` (misma limitación de tipos de Sequelize con
// asociaciones que en el resto del proyecto).
type ItemWithProduct = { product?: Pick<ProductAttributes, "name"> | null };

// Mueve un producto a otra columna del kanban de producción. Las columnas y la
// regla de avance las configura cada empresa en "Flujo de producción" (Sprint
// 2, ítem 5): en modo lineal solo a la vecina (y hacia atrás si lo permite),
// en modo libre a cualquier columna activa.
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
  if (!item) throw new AppError(404, "El item no existe");

  const quotation = await DataBase.instance.quotation.findOne({ where: { id: item.quotation_id } });
  if (!quotation) throw new AppError(404, "La cotización no existe");

  // Ya está ahí (doble clic, dos pestañas): no es un error ni un movimiento.
  if (item.stage_id === nextStageId) return [0];

  const { workflow, stages } = await ensureCompanyWorkflow(quotation.company_id, updatedBy ?? null);
  const activeStages = stages.filter((stage) => stage.active);
  try {
    assertMoveAllowed(
      { flowMode: workflow.flow_mode, allowBackward: Boolean(workflow.allow_backward) },
      activeStages.map((stage) => ({ id: Number(stage.id) })),
      item.stage_id === null ? null : Number(item.stage_id),
      nextStageId
    );
  } catch (error: unknown) {
    // El controller ya traduce InvalidTransitionError a 400.
    if (error instanceof StageMoveNotAllowedError) throw new InvalidTransitionError(error.message);
    throw error;
  }
  const nextStage = activeStages.find((stage) => Number(stage.id) === nextStageId);

  // Escribe en 3 tablas (quotation_item, quotation_item_stage_log,
  // quotation_event) — todo o nada.
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // La producción solo avanza en una cotización aceptada o en curso (pedido
    // explícito del usuario); antes se podían mover las etapas de una
    // Pendiente o de una Rechazada.
    await assertQuotationIsActive(item.quotation_id, "mover la producción", transaction);

    const now = nowUtc();
    const result = await DataBase.instance.quotation_item.update(
      { stage_id: nextStageId, updated_by: updatedBy, updated_at: now },
      { where: { id: itemId }, transaction }
    );

    // Historial del producto: con esto se mide cuánto pasó en cada etapa.
    await DataBase.instance.quotation_item_stage_log.create(
      {
        id: 0,
        company_id: quotation.company_id,
        quotation_id: item.quotation_id,
        quotation_item_id: itemId,
        from_stage_id: item.stage_id ?? null,
        to_stage_id: nextStageId,
        created_by: updatedBy ?? null,
        created_at: now,
        updated_by: updatedBy ?? null,
        updated_at: now,
      },
      { transaction }
    );

    await logQuotationEvent({
      quotationId: item.quotation_id,
      action: "item_stage_changed",
      description: `"${(item as unknown as ItemWithProduct).product?.name ?? 'Producto'}" pasó a la etapa "${nextStage?.name ?? ""}"`,
      actorId: updatedBy,
      transaction,
    });

    return result;
  });
};

export { changeItemStage };
