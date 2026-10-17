import { CompanyStatic } from "../../api/modules/company/model/company.model";
import { QuotationStatic } from "../../api/modules/quotation/model/quotation.model";
import { QuotationItemStatic } from "../../api/modules/quotation/model/quotation_item.model";
import { QuotationExpenseStatic } from "../../api/modules/quotation/model/quotation_expense.model";
import { PurchaseOrderStatic } from "../../api/modules/purchase_order/model/purchase_order.model";
import { PurchaseOrderItemStatic } from "../../api/modules/purchase_order/model/purchase_order_item.model";
import { PurchaseOrderItemPurchaseStatic } from "../../api/modules/purchase_order/model/purchase_order_item_purchase.model";
import { UserStatic } from "../../api/modules/users/models/user.model";

export const purchaseOrderAssociations = ({
  company,
  quotation,
  quotation_item,
  quotation_expense,
  purchase_order,
  purchase_order_item,
  purchase_order_item_purchase,
  user,
}: {
  company: CompanyStatic;
  quotation: QuotationStatic;
  quotation_item: QuotationItemStatic;
  quotation_expense: QuotationExpenseStatic;
  purchase_order: PurchaseOrderStatic;
  purchase_order_item: PurchaseOrderItemStatic;
  purchase_order_item_purchase: PurchaseOrderItemPurchaseStatic;
  user: UserStatic;
}): void => {
  company.hasMany(purchase_order, { foreignKey: "company_id", sourceKey: "id" });
  purchase_order.belongsTo(company, { foreignKey: "company_id", targetKey: "id" });

  quotation.hasMany(purchase_order, { foreignKey: "quotation_id", sourceKey: "id", as: "purchaseOrders" });
  purchase_order.belongsTo(quotation, { foreignKey: "quotation_id", targetKey: "id", as: "quotation" });

  purchase_order.belongsTo(user, { foreignKey: "assigned_to", targetKey: "id", as: "assignee" });
  purchase_order.belongsTo(user, { foreignKey: "created_by", targetKey: "id", as: "creator" });

  purchase_order.hasMany(purchase_order_item, { foreignKey: "purchase_order_id", sourceKey: "id", as: "items" });
  purchase_order_item.belongsTo(purchase_order, { foreignKey: "purchase_order_id", targetKey: "id" });

  quotation_item.hasMany(purchase_order_item, { foreignKey: "quotation_item_id", sourceKey: "id" });
  purchase_order_item.belongsTo(quotation_item, { foreignKey: "quotation_item_id", targetKey: "id", as: "quotationItem" });

  // Cada compra parcial de un item genera un gasto real de la cotización
  // (toda compra ES un gasto) — se guardan ambos ligados para poder
  // mostrar "cuánto se compró y por cuánto" sin tener que adivinar cuál
  // gasto de la lista general corresponde a cuál compra.
  purchase_order_item.hasMany(purchase_order_item_purchase, {
    foreignKey: "purchase_order_item_id",
    sourceKey: "id",
    as: "purchases",
  });
  purchase_order_item_purchase.belongsTo(purchase_order_item, {
    foreignKey: "purchase_order_item_id",
    targetKey: "id",
  });
  purchase_order_item_purchase.belongsTo(quotation_expense, {
    foreignKey: "quotation_expense_id",
    targetKey: "id",
    as: "expense",
  });
};
