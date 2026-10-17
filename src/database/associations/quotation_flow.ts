import { VariableGeneralStatic } from "../../api/modules/variable_general/models/variable_general.model";
import { QuotationItemStatic } from "../../api/modules/quotation/model/quotation_item.model";
import { QuotationStatic } from "../../api/modules/quotation/model/quotation.model";
import { QuotationPaymentStatic } from "../../api/modules/quotation/model/quotation_payment.model";
import { QuotationExpenseStatic } from "../../api/modules/quotation/model/quotation_expense.model";
import { QuotationEventStatic } from "../../api/modules/quotation/model/quotation_event.model";
import { UserStatic } from "../../api/modules/users/models/user.model";

export const quotationFlowAssociations = ({
  variable_general,
  quotation_item,
  quotation,
  quotation_payment,
  quotation_expense,
  quotation_event,
  user,
}: {
  variable_general: VariableGeneralStatic;
  quotation_item: QuotationItemStatic;
  quotation: QuotationStatic;
  quotation_payment: QuotationPaymentStatic;
  quotation_expense: QuotationExpenseStatic;
  quotation_event: QuotationEventStatic;
  user: UserStatic;
}): void => {
  // Las etapas de producción NO son un catálogo propio: son filas de
  // `general_variable` con category="production_stage" (globales o por
  // empresa, ver Variables Generales) — quotation_item solo guarda el id.
  quotation_item.belongsTo(variable_general, { foreignKey: "stage_id", targetKey: "id", as: "stage" });

  quotation.hasMany(quotation_payment, { foreignKey: "quotation_id", sourceKey: "id", as: "payments" });
  quotation_payment.belongsTo(quotation, { foreignKey: "quotation_id", targetKey: "id" });

  quotation.hasMany(quotation_expense, { foreignKey: "quotation_id", sourceKey: "id", as: "expenses" });
  quotation_expense.belongsTo(quotation, { foreignKey: "quotation_id", targetKey: "id" });

  quotation.hasMany(quotation_event, { foreignKey: "quotation_id", sourceKey: "id", as: "events" });
  quotation_event.belongsTo(quotation, { foreignKey: "quotation_id", targetKey: "id" });

  // Autor de cada evento/pago/gasto — para mostrar "quién lo hizo" en el
  // timeline sin una segunda consulta por cada fila.
  quotation_event.belongsTo(user, { foreignKey: "created_by", targetKey: "id", as: "actor" });
  quotation_payment.belongsTo(user, { foreignKey: "created_by", targetKey: "id", as: "actor" });
  quotation_expense.belongsTo(user, { foreignKey: "created_by", targetKey: "id", as: "actor" });
};
