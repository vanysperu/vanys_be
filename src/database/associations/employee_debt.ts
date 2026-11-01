import { UserStatic } from "../../api/modules/users/models/user.model";
import { CompanyStatic } from "../../api/modules/company/model/company.model";
import { PurchaseOrderItemPurchaseStatic } from "../../api/modules/purchase_order/model/purchase_order_item_purchase.model";
import { EmployeeDebtStatic } from "../../api/modules/employee_debt/model/employee_debt.model";
import { EmployeeDebtPaymentStatic } from "../../api/modules/employee_debt/model/employee_debt_payment.model";
import { EmployeeDebtPaymentAllocationStatic } from "../../api/modules/employee_debt/model/employee_debt_payment_allocation.model";
import { VariableGeneralStatic } from "../../api/modules/variable_general/models/variable_general.model";

export const employeeDebtAssociations = ({
  company,
  user,
  purchase_order_item_purchase,
  employee_debt,
  employee_debt_payment,
  employee_debt_payment_allocation,
  variable_general,
}: {
  company: CompanyStatic;
  user: UserStatic;
  purchase_order_item_purchase: PurchaseOrderItemPurchaseStatic;
  employee_debt: EmployeeDebtStatic;
  employee_debt_payment: EmployeeDebtPaymentStatic;
  employee_debt_payment_allocation: EmployeeDebtPaymentAllocationStatic;
  variable_general: VariableGeneralStatic;
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

  // Reposiciones: a quién se le repuso, desde qué cuenta, quién la registró
  // y qué deudas cubrió.
  employee_debt_payment.belongsTo(user, { foreignKey: "user_id", targetKey: "id", as: "employee" });
  employee_debt_payment.belongsTo(user, { foreignKey: "created_by", targetKey: "id", as: "actor" });
  employee_debt_payment.belongsTo(variable_general, {
    foreignKey: "payment_account_id",
    targetKey: "id",
    as: "paymentAccount",
  });
  employee_debt_payment.hasMany(employee_debt_payment_allocation, {
    foreignKey: "employee_debt_payment_id",
    sourceKey: "id",
    as: "allocations",
  });
  employee_debt_payment_allocation.belongsTo(employee_debt, {
    foreignKey: "employee_debt_id",
    targetKey: "id",
    as: "debt",
  });
};
