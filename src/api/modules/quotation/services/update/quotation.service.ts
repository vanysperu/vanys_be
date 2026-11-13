import { createDeliveryExit } from "../../../inventory/services/integrations/delivery_exit";
import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import {
  computeQuotationTotal,
  QUOTATION_STATUS_LABEL,
  QuotationAttributes,
  QuotationModel,
  QuotationStatus,
} from "../../model/quotation.model";
import { registerInvoice } from "../../../invoice/services/shared/register_invoice";
import { logQuotationEvent } from "../timeline/quotation_event.service";
import { getIgvRate } from "../shared/tax_config";
import { CreateQuotationPaymentInput, insertQuotationPayment } from "../create/quotation_payment.service";
import { computeDefaultValidUntil } from "../create/quotation.service";
import { assertRequestedQuotationIsComplete } from "./quotation_items.service";

// Solo al aceptar se puede registrar un adelanto junto con el cambio de
// estado (pedido explícito del usuario: al pasar a "Aceptada" preguntar si
// el cliente pagó adelanto).
export class AdvanceOnlyOnAcceptError extends Error {}

// Cadena principal del flujo (flujo de estados, ver flujo de cotizacion +
// estados.pdf). Desde cualquier punto de la cadena se puede avanzar al
// siguiente O retroceder al anterior — nunca saltar más de un paso — más
// las salidas de excepción del diagrama original (rechazada solo desde
// pending; cancelada desde accepted/design_pending/in_process).
// rejected/expired/cancelled/finished no tienen salida: son finales.
//
// "expired" NO está en esta lista a propósito: vencer una cotización no es
// una decisión manual de un usuario, es automático según `valid_until`
// (ver services/jobs/expireQuotations.job.ts, que actualiza el estado
// directo sin pasar por este mapa de transiciones "elegibles a mano").
const MAIN_CHAIN: QuotationStatus[] = [
  "pending",
  "accepted",
  "design_pending",
  "in_process",
  "ready",
  "delivered",
  "finished",
];

const EXIT_TRANSITIONS: Partial<Record<QuotationStatus, QuotationStatus[]>> = {
  pending: ["rejected"],
  accepted: ["cancelled"],
  design_pending: ["cancelled"],
  in_process: ["cancelled"],
};

const buildAllowedTransitions = (): Record<QuotationStatus, QuotationStatus[]> => {
  const map = {} as Record<QuotationStatus, QuotationStatus[]>;

  MAIN_CHAIN.forEach((status, index) => {
    const steps: QuotationStatus[] = [];
    if (index > 0) steps.push(MAIN_CHAIN[index - 1]!);
    if (index < MAIN_CHAIN.length - 1) steps.push(MAIN_CHAIN[index + 1]!);
    map[status] = [...steps, ...(EXIT_TRANSITIONS[status] ?? [])];
  });

  // Pedido de la web: se completa y pasa a Pendiente (recién ahí se le
  // envía al cliente), o se descarta como Rechazada. No se vuelve a
  // "Pendiente de cotizar" desde Pendiente: sus items ya se cotizaron.
  map.quote_requested = ["pending", "rejected"];
  map.rejected = [];
  map.expired = [];
  map.cancelled = [];
  map.finished = [];

  return map;
};

export const ALLOWED_TRANSITIONS = buildAllowedTransitions();

export class InvalidTransitionError extends Error {}
export class QuotationHasMoneyInvolvedError extends Error {}

// Quitar el IGV baja el total: si el cliente ya pagó más que el total nuevo,
// la cotización quedaría sobre-pagada (saldo negativo) sin ningún aviso.
export class TotalBelowPaidError extends Error {}

// Destinos que dejarían el dinero colgado: rechazar/cancelar son estados
// finales, y una cotización que vuelve a Pendiente sale de "Por cobrar" y el
// job de vencimiento la puede cerrar sola (ej. aceptada con adelanto y
// arrastrada de vuelta a Pendiente en el Kanban).
const MONEY_BLOCKED_TARGETS: Partial<Record<QuotationStatus, string>> = {
  rejected: "rechazar",
  cancelled: "cancelar",
  pending: "volver a Pendiente",
};

// Antes nada impedía rechazar o cancelar una cotización que YA tenía dinero
// cobrado (total_paid > 0) o compras reales hechas (purchase_order_item_
// purchase) — el dinero/las compras quedaban "colgados" en una cotización
// cerrada, sin ningún aviso, hasta que alguien lo notara en una auditoría
// manual. Rechazar/cancelar con plata o compras de por medio exige primero
// resolver eso (anular los pagos, revisar las compras) — nunca es automático.
// `quotation` ya viene leída con lock dentro de `transaction`.
const assertNoMoneyInvolved = async (quotation: QuotationModel, action: string, transaction: Transaction) => {
  if (Number(quotation.total_paid) > 0) {
    throw new QuotationHasMoneyInvolvedError(
      `No se puede ${action}: esta cotización ya tiene pagos registrados. Anula los pagos primero.`
    );
  }

  const [purchaseRow] = (await DataBase.instance.sequelize.query(
    `SELECT COUNT(*) AS total
     FROM purchase_order_item_purchase poip
     INNER JOIN purchase_order_item poi ON poi.id = poip.purchase_order_item_id
     INNER JOIN purchase_order po ON po.id = poi.purchase_order_id
     WHERE po.quotation_id = :quotationId
       -- Una compra anulada ya no es plata gastada: no bloquea cancelar.
       AND poip.is_deleted = false`,
    { type: QueryTypes.SELECT, replacements: { quotationId: quotation.id }, transaction }
  )) as { total: number }[];

  if (Number(purchaseRow?.total ?? 0) > 0) {
    throw new QuotationHasMoneyInvolvedError(
      `No se puede ${action}: esta cotización ya tiene compras reales registradas en una orden de compra.`
    );
  }
};

const updateQuotationById = async ({
  quotation,
  quotationId,
  updatedBy,
}: {
  quotation: {
    notes?: string | null;
    valid_until?: string | null;
    includes_delivery?: boolean;
    includes_design?: boolean;
    includes_igv?: boolean;
    billing_name?: string | null;
    billing_document_number?: string | null;
    production_days?: number | null;
  };
  quotationId: number;
  updatedBy?: number;
}) => {
  // Whitelist explícita — nunca `{...quotation}` directo. `quotation` viene
  // de `req.body` sin tipar de verdad en runtime (el tipo del parámetro es
  // solo chequeo de compilación); sin esto, el dueño de una cotización
  // propia podía mandar `company_id`/`business_unit_id`/`client_id`/
  // `status`/`total`/`total_paid` en el body de `PUT /quotation/update/:id`
  // y "mudar" la cotización (con su cliente, pagos y gastos vinculados) a
  // otra empresa, o falsear sus montos sin pasar por recalculateTotalPaid
  // ni por la máquina de estados de changeQuotationStatus.
  const updateData: Partial<QuotationAttributes> = {
    notes: quotation.notes,
    valid_until: quotation.valid_until,
    includes_delivery: quotation.includes_delivery,
    includes_design: quotation.includes_design,
    includes_igv: quotation.includes_igv,
    billing_name: quotation.billing_name,
    billing_document_number: quotation.billing_document_number,
    production_days: quotation.production_days,
    updated_by: updatedBy,
    updated_at: nowUtc(),
  };

  // Escribe en 2 tablas (quotation, quotation_event) — se envuelve en una
  // transacción para que no quede un evento de timeline "huérfano" si la
  // actualización de la cotización fallara (o viceversa).
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // Si cambia includes_igv, el total se recalcula desde el subtotal ya
    // guardado (los items de una cotización ya creada no se vuelven a editar
    // en este flujo, así que no hace falta re-sumarlos). El lock serializa
    // contra un pago que se esté registrando al mismo tiempo (que toma el
    // mismo lock, ver assertPaymentWithinBalance).
    if (typeof quotation.includes_igv === "boolean") {
      const current = await DataBase.instance.quotation.findOne({
        where: { id: quotationId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!current) throw new Error("La cotización no existe");
      const igvRate = await getIgvRate(current.company_id);
      const total = computeQuotationTotal(Number(current.subtotal), quotation.includes_igv, igvRate);
      const totalPaid = Number(current.total_paid);
      if (totalPaid > total) {
        throw new TotalBelowPaidError(
          `No se puede quitar el IGV: el cliente ya pagó S/ ${totalPaid.toFixed(2)} y el nuevo total sería S/ ${total.toFixed(2)}. Corrige los pagos primero.`
        );
      }
      updateData.total = total;
    }

    const result = await DataBase.instance.quotation.update(updateData, { where: { id: quotationId }, transaction });

    await logQuotationEvent({
      quotationId,
      action: "updated",
      description: "Se actualizaron los datos de la cotización",
      actorId: updatedBy,
      transaction,
    });

    return result;
  });
};

const changeQuotationStatus = async ({
  quotationId,
  nextStatus,
  updatedBy,
  advancePayment,
  invoiceIssued = false,
}: {
  quotationId: number;
  nextStatus: QuotationStatus;
  updatedBy?: number;
  // Adelanto opcional que se registra en la MISMA transacción del cambio de
  // estado: si el pago falla (sobre-pago, cuenta inválida), la cotización
  // no queda aceptada a medias.
  advancePayment?: CreateQuotationPaymentInput;
  // Al cerrar (Finalizada): ¿emitimos factura? (pedido explícito del usuario).
  invoiceIssued?: boolean;
}) => {
  if (advancePayment && nextStatus !== "accepted") {
    throw new AdvanceOnlyOnAcceptError("El adelanto solo se puede registrar al aceptar la cotización");
  }

  // Escribe en 2 tablas (quotation, quotation_event) — y, con adelanto, también
  // en quotation_payment — todo o nada.
  return DataBase.instance.sequelize.transaction(async (transaction) => {
    // Se lee con lock y se valida DENTRO de la transacción: antes se validaba
    // afuera, y dos cambios casi simultáneos (dos personas, o el job de
    // vencimiento) pasaban la validación con el mismo estado de origen, o se
    // registraba un pago entre el chequeo de dinero y el cambio de estado.
    const current = await DataBase.instance.quotation.findOne({
      where: { id: quotationId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!current) throw new Error("La cotización no existe");

    const currentStatus = current.status;
    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(nextStatus)) {
      throw new InvalidTransitionError(
        `No se puede pasar de "${currentStatus}" a "${nextStatus}". Transiciones válidas: ${allowed.join(", ") || "ninguna (estado final)"}`
      );
    }

    const blockedAction = MONEY_BLOCKED_TARGETS[nextStatus];
    if (blockedAction) await assertNoMoneyInvolved(current, blockedAction, transaction);

    const sendsWebRequestToClient = currentStatus === "quote_requested" && nextStatus === "pending";
    if (sendsWebRequestToClient) await assertRequestedQuotationIsComplete(quotationId, transaction);

    // La vigencia de un pedido de la web se cuenta desde que se le envía al
    // cliente (pasa a Pendiente), no desde que llegó: si el equipo tardó en
    // completarla, igual tiene sus días completos antes de que el job la venza.
    const now = nowUtc();
    const validUntil = sendsWebRequestToClient ? await computeDefaultValidUntil(now, current.company_id) : undefined;

    const result = await DataBase.instance.quotation.update(
      {
        status: nextStatus,
        status_changed_at: now,
        updated_by: updatedBy,
        updated_at: now,
        ...(validUntil ? { valid_until: validUntil } : {}),
      },
      { where: { id: quotationId }, transaction }
    );

    await logQuotationEvent({
      quotationId,
      action: "status_changed",
      description: `Estado cambiado de "${QUOTATION_STATUS_LABEL[currentStatus]}" a "${QUOTATION_STATUS_LABEL[nextStatus]}"`,
      actorId: updatedBy,
      transaction,
    });

    if (advancePayment) {
      await insertQuotationPayment({
        quotationId,
        input: { ...advancePayment, notes: advancePayment.notes?.trim() || "Adelanto" },
        createdBy: updatedBy,
        transaction,
        isAdvance: true,
      });
    }

    // Inventario (Sprint 2, ítem 2, D4): al marcarla Entregada, sale el stock
    // del almacén de su tienda (si la tienda lo usa). Misma transacción.
    if (nextStatus === "delivered") {
      await createDeliveryExit({ quotation: current, actorId: updatedBy ?? null, transaction });
    }

    // Al cerrar la cotización: si se emitió factura, queda registrada (su
    // archivo se sube aparte o queda en "Faltan subir"). Misma transacción.
    let invoiceId: number | null = null;
    if (nextStatus === "finished" && invoiceIssued) {
      const client = await DataBase.instance.client.findByPk(current.client_id, { attributes: ["name"], transaction });
      invoiceId = await registerInvoice({
        companyId: Number(current.company_id),
        businessUnitId: current.business_unit_id ?? null,
        type: "issued",
        quotationId,
        purchaseId: null,
        description: client?.name ?? `Cotización ${quotationId}`,
        actorId: updatedBy ?? null,
        transaction,
      });
    }

    return { updated: result[0], invoice_id: invoiceId };
  });
};

export { updateQuotationById, changeQuotationStatus };
