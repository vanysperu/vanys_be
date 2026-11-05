import { DataBase } from "../../../../../database";
import { VariableGeneralPartialAttributes } from "../../models/variable_general.model";
import { assertCompanyAssetUsable } from "../../../uploads/services/find/company_asset.service";
import { assertProductSubcategoryParent, assertUniqueProductCategoryName } from "../shared/product_category.service";
import { assertUniqueAdvertisementZoneCode } from "../shared/advertisement_zone.service";

export async function createVariableGeneral(payload: VariableGeneralPartialAttributes) {
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
    company_id: payload.company_id!,
  });
  return created;
}


