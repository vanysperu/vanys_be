import { IToken } from "../../../interfaces/IToken.interface";
import { DataBase } from "../../../../database";
import { AppError } from "../../../../core/errors/AppError";
import { fromCents, toCents } from "../../../../core/utils/money";
import { todayInBusinessTz } from "../../../../utils/dateUtils";
import { createQuotation } from "../../quotation/services/create/quotation.service";
import { changeQuotationStatus } from "../../quotation/services/update/quotation.service";
import { LessonPreparation, PreparedLessonResult } from "../types/tutorial.types";
import { assertPracticeSession } from "./shared/practice_owner.service";

const PRACTICE_QUANTITY = 50;

// POST /tutorial/practice/prepare: deja lista una cotización para la lección
// (ej. "El cliente aceptó" necesita una pendiente; "Compras" una aceptada).
// Así cada lección se puede hacer en cualquier orden y repetir. Solo dentro de
// la empresa de práctica, con los servicios normales del sistema.
export const prepareLessonService = async (user: IToken, preparation: LessonPreparation): Promise<PreparedLessonResult> => {
  const companyId = await assertPracticeSession(user);
  const active = { company_id: companyId, is_deleted: false };
  const [client, product, technique] = await Promise.all([
    DataBase.instance.client.findOne({ where: active, order: [["id", "ASC"]] }),
    DataBase.instance.product.findOne({ where: { ...active, requires_customization: true }, order: [["id", "ASC"]] }),
    DataBase.instance.customization_technique.findOne({ where: active, order: [["id", "ASC"]] }),
  ]);
  if (!client || !product || !technique) {
    throw new AppError(
      409,
      "Faltan los ejemplos de la empresa de práctica: reiníciala desde Aprender",
      undefined,
      "PRACTICE_SAMPLES_MISSING"
    );
  }

  const quotation = await createQuotation({
    input: {
      company_id: companyId,
      business_unit_id: user.businessUnitId ?? null,
      client_id: Number(client.id),
      includes_igv: true,
      items: [
        { product_id: Number(product.id), technique_id: Number(technique.id), quantity: PRACTICE_QUANTITY, pricing_mode: "unit" },
      ],
    },
    createdBy: user.userId,
  });
  const quotationId = Number(quotation.id);
  if (preparation === "pending_quotation") return { quotation_id: quotationId };

  // Aceptada con la mitad de adelanto en efectivo, como lo haría el equipo.
  await changeQuotationStatus({
    quotationId,
    nextStatus: "accepted",
    updatedBy: user.userId,
    advancePayment: {
      amount: fromCents(Math.round(toCents(quotation.total) / 2)),
      method: "cash",
      paid_at: todayInBusinessTz(),
      notes: "Adelanto (práctica)",
    },
  });
  return { quotation_id: quotationId };
};
