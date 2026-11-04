import { DataBase } from "../../../../../database";
import { VariableGeneralPartialAttributes } from "../../models/variable_general.model";
import { assertCompanyAssetUsable } from "../../../uploads/services/find/company_asset.service";

export async function createVariableGeneral(payload: VariableGeneralPartialAttributes) {
  // ref2 guarda el QR de una cuenta de pago: tiene que ser una imagen vigente
  // de la misma empresa (ver assertCompanyAssetUsable).
  await assertCompanyAssetUsable(payload.ref2, payload.company_id ?? null);

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


