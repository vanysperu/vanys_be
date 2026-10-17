import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { QuotationEventAction } from "../../model/quotation_event.model";

// Recorta un texto para el timeline — el evento es un resumen, no una copia
// completa del gasto/nota (que puede tener hasta 500 caracteres): mostrar
// todo dos veces (acá y en la pestaña Gastos/Compras) se veía mal y hacía
// el historial ilegible con notas largas.
export const truncateForTimeline = (text: string, max = 80): string =>
  text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

// Registra un evento inmutable en el timeline de una cotización. Se llama
// desde los demás services de este módulo (crear, cambiar estado, mover
// etapa de un item, agregar pago/gasto) — nunca se expone como endpoint
// propio para escribir, solo para leer (ver find/quotation_event.service.ts).
// Acepta una `transaction` opcional para poder ser parte de una operación
// atómica más grande (ej. registrar una compra: gasto + evento + estado del
// item, todo o nada — antes el evento se guardaba suelto y un fallo
// posterior podía dejar datos huérfanos, ver purchase_order_item_purchase.service.ts).
const logQuotationEvent = async ({
  quotationId,
  action,
  description,
  actorId,
  transaction,
}: {
  quotationId: number;
  action: QuotationEventAction;
  description: string;
  actorId?: number;
  transaction?: Transaction;
}) => {
  return DataBase.instance.quotation_event.create(
    {
      id: 0,
      quotation_id: quotationId,
      action,
      description,
      created_by: actorId ?? null,
      created_at: nowUtc(),
    },
    { transaction }
  );
};

export { logQuotationEvent };
