import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc } from "../../../../../utils/dateUtils";
import { roundMoney } from "../../../../../utils/numbers";
import { computeQuotationTotal } from "../../model/quotation.model";
import { CreateQuotationItemInput, priceQuotationItems } from "../create/quotation.service";
import { getOrderedProductionStages } from "../shared/production_stages";
import { getIgvRate } from "../shared/tax_config";
import { logQuotationEvent } from "../timeline/quotation_event.service";

// Lo que el equipo completa de una cotización que llegó desde la web: los
// items (con técnica y modo de precio) y los datos de cabecera que se
// eligen al cotizar. Cliente, empresa y tienda NO se cambian acá.
export interface CompleteQuotationInput {
  items: CreateQuotationItemInput[];
  includes_delivery?: boolean;
  includes_design?: boolean;
  includes_igv?: boolean;
  notes?: string | null;
  production_days?: number | null;
  billing_name?: string | null;
  billing_document_number?: string | null;
}

const notEditable = () =>
  new AppError(
    409,
    "Solo se pueden editar los productos de una cotización en \"Pendiente de cotizar\"",
    undefined,
    "QUOTATION_NOT_EDITABLE"
  );

// Reemplaza TODOS los items de una cotización "Pendiente de cotizar" con las
// reglas completas de crear (mismo cálculo de precio, IGV y validación de
// empresa/catálogo). Una vez que pasa a "Pendiente" los items quedan
// congelados como en cualquier cotización. Todo en una transacción: o quedan
// los items nuevos con su total, o queda todo como estaba.
export async function completeRequestedQuotation({
  quotationId,
  input,
  updatedBy,
}: {
  quotationId: number;
  input: CompleteQuotationInput;
  updatedBy: number;
}) {
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // Lock: serializa contra un cambio de estado simultáneo (ej. alguien la
    // pasa a "Pendiente" mientras otro guarda los productos).
    const quotation = await DataBase.instance.quotation.findOne({
      where: { id: quotationId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!quotation) throw new AppError(404, "La cotización no existe");
    if (quotation.status !== "quote_requested") throw notEditable();

    const { items, subtotal } = await priceQuotationItems({
      items: input.items,
      companyId: quotation.company_id,
      transaction,
    });
    const includesIgv = input.includes_igv ?? quotation.includes_igv;
    const igvRate = await getIgvRate(quotation.company_id);
    const total = roundMoney(computeQuotationTotal(subtotal, Boolean(includesIgv), igvRate));

    // Borrado físico a propósito: son items de un borrador que nunca se
    // cotizó al cliente (sin pagos, compras ni producción: todo eso exige una
    // cotización aceptada), y la cotización registra el cambio en su timeline.
    await DataBase.instance.quotation_item.destroy({ where: { quotation_id: quotationId }, transaction });

    const stages = await getOrderedProductionStages(quotation.company_id, transaction);
    const firstStageId = stages[0]?.id ?? null;
    const now = nowUtc();
    await DataBase.instance.quotation_item.bulkCreate(
      items.map((item) => ({
        id: 0,
        quotation_id: quotationId,
        product_id: item.product_id,
        technique_id: item.technique_id ?? null,
        stage_id: firstStageId,
        quantity: item.quantity,
        pricing_mode: item.pricing_mode,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
        created_by: updatedBy,
        created_at: now,
        updated_by: updatedBy,
        updated_at: now,
      })),
      { transaction }
    );

    await DataBase.instance.quotation.update(
      {
        subtotal,
        total,
        includes_igv: Boolean(includesIgv),
        includes_delivery: input.includes_delivery ?? quotation.includes_delivery,
        includes_design: input.includes_design ?? quotation.includes_design,
        notes: input.notes === undefined ? quotation.notes : input.notes,
        production_days: input.production_days === undefined ? quotation.production_days : input.production_days,
        billing_name: input.billing_name === undefined ? quotation.billing_name : input.billing_name,
        billing_document_number:
          input.billing_document_number === undefined ? quotation.billing_document_number : input.billing_document_number,
        updated_by: updatedBy,
        updated_at: now,
      },
      { where: { id: quotationId }, transaction }
    );

    await logQuotationEvent({
      quotationId,
      action: "updated",
      description: `Se completaron los productos de la cotización (${items.length} producto(s), total S/ ${total.toFixed(2)})`,
      actorId: updatedBy,
      transaction,
    });

    return { id: quotationId, subtotal, total, items_count: items.length };
  });
}

interface IncompleteItemRow {
  product_name: string;
  requires_customization: number | boolean;
  technique_id: number | null;
  unit_price: string | number;
}

// Antes de pasar de "Pendiente de cotizar" a "Pendiente" (= se le envía al
// cliente), la cotización tiene que estar cotizada de verdad: al menos un
// producto, técnica donde el producto la requiere y precio en cada item. Lo
// que llega de la web puede venir sin técnica ni precio.
export async function assertRequestedQuotationIsComplete(quotationId: number, transaction: Transaction) {
  const rows = (await DataBase.instance.sequelize.query(
    `SELECT p.name AS product_name, p.requires_customization, qi.technique_id, qi.unit_price
     FROM quotation_item qi
     INNER JOIN product p ON p.id = qi.product_id
     WHERE qi.quotation_id = :quotationId`,
    { type: QueryTypes.SELECT, replacements: { quotationId }, transaction }
  )) as IncompleteItemRow[];

  if (rows.length === 0) {
    throw new AppError(409, "La cotización no tiene productos: complétala antes de pasarla a Pendiente", undefined, "QUOTATION_INCOMPLETE");
  }

  const missingTechnique = rows.find((row) => Boolean(row.requires_customization) && !row.technique_id);
  if (missingTechnique) {
    throw new AppError(
      409,
      `Falta la técnica de personalización de "${missingTechnique.product_name}": completa la cotización antes de pasarla a Pendiente`,
      undefined,
      "QUOTATION_INCOMPLETE"
    );
  }

  const missingPrice = rows.find((row) => Number(row.unit_price) <= 0);
  if (missingPrice) {
    throw new AppError(
      409,
      `"${missingPrice.product_name}" no tiene precio: completa la cotización antes de pasarla a Pendiente`,
      undefined,
      "QUOTATION_INCOMPLETE"
    );
  }
}
