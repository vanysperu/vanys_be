import { Transaction, UniqueConstraintError } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { nowUtc, todayInBusinessTz } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import { hasCompanyFeature } from "../../../company_feature/services/shared/feature_store";
import { createSaleExit } from "../../../inventory/services/integrations/delivery_exit";
import { logQuotationEvent } from "../../../quotation/services/timeline/quotation_event.service";
import type { DispatchGuideModel } from "../../model/dispatch_guide.models";
import type { GuideDto, GuideFileInput, RegisterGuideInput } from "../../types/dispatch_guide.types";
import { SALE_REASON_CODES } from "../../types/dispatch_guide.types";
import { assertWithinOrdered } from "./dispatch_control";
import { saveGuidePdf } from "./guide_file";
import { lockQuotationForGuide, lockTransferForGuide } from "./guide_input";
import { GUIDE_SERIES_PATTERN, assertGuideComplete } from "./guide_requirements";
import { assertDraft, guideNumberText, loadGuideForCaller, toGuideDto } from "./guide_shared";

const numberTaken = (text: string) => new AppError(409, `Ya hay una guía ${text} registrada en la empresa`, undefined, "GUIDE_NUMBER_TAKEN");

/**
 * D4: una guía de VENTA (01, 03, 14) de una cotización descuenta el stock al
 * registrarse si la tienda eligió "al emitir la guía". Sale del almacén de
 * partida de la guía (o del predeterminado de la tienda). Si no alcanza, la
 * salida queda en borrador y se avisa, igual que al marcar Entregada.
 */
const exitStockForGuide = async (guide: DispatchGuideModel, actorId: number, transaction: Transaction): Promise<void> => {
  if (guide.quotation_id === null || !SALE_REASON_CODES.includes(guide.reason_code) || guide.business_unit_id === null) return;
  const companyId = Number(guide.company_id);
  if (!(await hasCompanyFeature(companyId, "inventory", transaction))) return;
  const store = await DataBase.instance.business_unit.findByPk(guide.business_unit_id, {
    attributes: ["id", "inventory_enabled", "inventory_exit_on"],
    transaction,
  });
  if (!store?.inventory_enabled || store.inventory_exit_on !== "dispatch_guide") return;

  const warehouse =
    guide.origin_warehouse_id !== null
      ? await DataBase.instance.warehouse.findOne({ where: { id: guide.origin_warehouse_id, company_id: companyId, active: true, is_transit: false }, transaction })
      : await DataBase.instance.warehouse.findOne({ where: { business_unit_id: store.id, is_default: true, active: true, is_transit: false }, transaction });
  if (!warehouse) return;

  const lines = await DataBase.instance.dispatch_guide_line.findAll({ where: { guide_id: guide.id }, attributes: ["product_id", "color", "quantity"], transaction });
  await createSaleExit({
    companyId,
    warehouse,
    quotationId: Number(guide.quotation_id),
    clientId: guide.client_id === null ? null : Number(guide.client_id),
    dispatchGuideId: Number(guide.id),
    lines: lines
      .filter((line) => line.product_id !== null)
      .map((line) => ({ productId: Number(line.product_id), color: line.color, quantity: Number(line.quantity) })),
    note: `Guía de remisión ${guideNumberText(guide)} de la cotización #${guide.quotation_id}.`,
    actorId,
    transaction,
  });
};

/**
 * Registra la guía ya EMITIDA en SUNAT (modo manual, plan §9.3 opción C): la
 * persona la emitió en SEE-SOL / App Emprender y acá anota su serie y número
 * (y, si lo tiene, sube el PDF en el mismo paso). Todo en una transacción:
 * número, archivo, control de lo despachado, salida de almacén e historial.
 * Nada se envía a SUNAT.
 */
export const registerGuideService = async (
  id: number,
  input: RegisterGuideInput,
  file: GuideFileInput | null,
  user: IToken
): Promise<GuideDto> => {
  const series = input.series.trim().toUpperCase();
  if (!GUIDE_SERIES_PATTERN.test(series)) throw new AppError(400, "La serie de la guía es T y 3 caracteres (ej. T001)", undefined, "GUIDE_SERIES_INVALID");
  const text = `${series}-${input.number}`;

  try {
    return await DataBase.instance.sequelize.transaction(async (transaction) => {
      const guide = await loadGuideForCaller(id, user, "write", transaction);
      assertDraft(guide);
      await assertGuideComplete(guide, transaction);

      // Vuelve a controlar lo despachado con la cotización bloqueada: entre el
      // borrador y el registro pudo registrarse otra guía de la misma cotización.
      if (guide.quotation_id !== null) {
        await lockQuotationForGuide(Number(guide.quotation_id), user, transaction);
        const lines = await DataBase.instance.dispatch_guide_line.findAll({ where: { guide_id: guide.id }, attributes: ["product_id", "color", "quantity"], transaction });
        await assertWithinOrdered(
          Number(guide.quotation_id),
          lines.map((line) => ({ productId: line.product_id === null ? null : Number(line.product_id), color: line.color, quantity: Number(line.quantity) })),
          Number(guide.id),
          transaction
        );
      }
      if (guide.stock_document_id !== null) await lockTransferForGuide(Number(guide.stock_document_id), user, Number(guide.id), transaction);

      const taken = await DataBase.instance.dispatch_guide.findOne({
        where: { company_id: guide.company_id, series, number: input.number },
        attributes: ["id"],
        transaction,
      });
      if (taken) throw numberTaken(text);

      const now = nowUtc();
      await guide.update(
        {
          series,
          number: input.number,
          status: "manual",
          issue_date: input.issue_date || todayInBusinessTz(),
          registered_at: now,
          registered_by: user.userId,
          updated_by: user.userId,
          updated_at: now,
        },
        { transaction }
      );
      if (file) await saveGuidePdf({ guideId: Number(guide.id), companyId: Number(guide.company_id), file, actorId: user.userId, transaction });
      await exitStockForGuide(guide, user.userId, transaction);
      if (guide.quotation_id !== null) {
        await logQuotationEvent({
          quotationId: Number(guide.quotation_id),
          action: "dispatch_guide_registered",
          description: `Guía de remisión ${text} registrada`,
          actorId: user.userId,
          transaction,
        });
      }
      return toGuideDto(guide, transaction);
    });
  } catch (error: unknown) {
    // Dos registros del mismo número a la vez: el índice único frena al segundo.
    if (error instanceof UniqueConstraintError) throw numberTaken(text);
    throw error;
  }
};
