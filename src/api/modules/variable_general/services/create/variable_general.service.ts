import { DataBase } from "../../../../../database";
import { VariableGeneralPartialAttributes } from "../../models/variable_general.model";

export async function createVariableGeneral(payload: VariableGeneralPartialAttributes) {
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


