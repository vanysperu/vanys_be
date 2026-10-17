import { UserStatic } from "../../api/modules/users/models/user.model";
import { CompanyStatic } from "../../api/modules/company/model/company.model";
import { PurchaseOrderItemPurchaseStatic } from "../../api/modules/purchase_order/model/purchase_order_item_purchase.model";
import { EmployeeDebtStatic } from "../../api/modules/employee_debt/model/employee_debt.model";

export const employeeDebtAssociations = ({
  company,
  user,
  purchase_order_item_purchase,
  employee_debt,
}: {
  company: CompanyStatic;
  user: UserStatic;
  purchase_order_item_purchase: PurchaseOrderItemPurchaseStatic;
  employee_debt: EmployeeDebtStatic;
}): void => {
  company.hasMany(employee_debt, { foreignKey: "company_id", sourceKey: "id" });
  employee_debt.belongsTo(company, { foreignKey: "company_id", targetKey: "id" });

  user.hasMany(employee_debt, { foreignKey: "user_id", sourceKey: "id", as: "debts" });
  employee_debt.belongsTo(user, { foreignKey: "user_id", targetKey: "id", as: "employee" });

  purchase_order_item_purchase.hasOne(employee_debt, {
    foreignKey: "purchase_order_item_purchase_id",
    sourceKey: "id",
    as: "debt",
  });
  employee_debt.belongsTo(purchase_order_item_purchase, {
    foreignKey: "purchase_order_item_purchase_id",
    targetKey: "id",
    as: "purchase",
  });
};
