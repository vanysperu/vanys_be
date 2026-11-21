import { DataBase } from "../../../../../database";
import { VariableGeneralPartialAttributes } from "../../models/variable_general.model";
import { assertCompanyAssetUsable } from "../../../uploads/services/find/company_asset.service";
import { assertProductSubcategoryParent, assertUniqueProductCategoryName } from "../shared/product_category.service";
import { assertUniqueAdvertisementZoneCode } from "../shared/advertisement_zone.service";
import { AppError } from "../../../../../core/errors/AppError";
import {
  assertPaymentAccountNumber,
  normalizePaymentAccountCci,
  PAYMENT_ACCOUNT_CATEGORY,
} from "../shared/payment_account.service";

export async function createVariableGeneral(payload: VariableGeneralPartialAttributes) {
  const isPaymentAccount = payload.category === PAYMENT_ACCOUNT_CATEGORY;
  // Una cuenta de pago siempre es de UNA empresa: una global (sin empresa) les
  // salía a todas (bug del 21-nov, la cuenta "Pruebas" de producción).
  if (isPaymentAccount && (payload.company_id === null || payload.company_id === undefined)) {
    throw new AppError(400, "Elige la empresa de la cuenta de pago", undefined, "PAYMENT_ACCOUNT_COMPANY_REQUIRED");
  }
  if (isPaymentAccount) assertPaymentAccountNumber(payload.prefix_id, payload.ref1);
  // CCI (solo cuentas bancarias): se guarda con sus 20 dígitos, sin guiones.
  const ref3 = isPaymentAccount ? normalizePaymentAccountCci(payload.prefix_id, payload.ref3) : (payload.ref3 ?? null);
  // ref2 guarda el QR de una cuenta de pago: tiene que ser una imagen vigente
  // de la misma empresa (ver assertCompanyAssetUsable).
  await assertCompanyAssetUsable(payload.ref2, payload.company_id ?? null);
  // Subcategoría de producto: ref1 = su categoría (ver product_category.service).
  await assertProductSubcategoryParent({
    category: payload.category,
    ref1: payload.ref1,
    companyId: payload.company_id ?? null,
  });
  // Zonas de anuncios: el código es lo que manda la web, no se repite.
  await assertUniqueAdvertisementZoneCode({
    id: null,
    category: payload.category,
    code: payload.prefix_id,
    companyId: payload.company_id ?? null,
  });
  // Categorías/subcategorías de producto: sin nombres repetidos.
  await assertUniqueProductCategoryName({
    id: null,
    category: payload.category,
    name: payload.name,
    ref1: payload.ref1,
    companyId: payload.company_id ?? null,
  });

  const model = DataBase.instance.variable_general;
  const created = await model.create({
    category: payload.category!,
    title: payload.title!,
    prefix_id: payload.prefix_id!,
    name: payload.name!,
    description: payload.description ?? "",
    ref1: payload.ref1 ?? "",
    ref2: payload.ref2 ?? "",
    ref3,
    show_in_quotation: payload.show_in_quotation ?? true,
    company_id: payload.company_id!,
  });
  return created;
}


