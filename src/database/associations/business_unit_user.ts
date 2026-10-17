import { BusinessUnitStatic } from "../../api/modules/business_unit/models/business_unit.models";
import { UserStatic } from "../../api/modules/users/models/user.model";

export const businessUnitHasManyUser = ({
  business_unit,
  user,
}: {
  business_unit: BusinessUnitStatic;
  user: UserStatic;
}): void => {
  business_unit.hasMany(user, {
    foreignKey: "business_unit_id",
    sourceKey: "id",
  });
  user.belongsTo(business_unit, {
    foreignKey: "business_unit_id",
    targetKey: "id",
  });
};
