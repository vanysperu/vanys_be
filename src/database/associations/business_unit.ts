import { BusinessUnitStatic } from "../../api/modules/business_unit/models/business_unit.models";
import { CompanyStatic } from "../../api/modules/company/model/company.model";

export const companyHasManybusinessUnit = ({
  business_unit,
  company,
}: {
  business_unit: BusinessUnitStatic;
  company: CompanyStatic;
}): void => {
  company.hasMany(business_unit, {
    foreignKey: "company_id",
    sourceKey: "id",
  });
  business_unit.belongsTo(company, {
    foreignKey: "company_id",
    targetKey: "id",
  });
};
