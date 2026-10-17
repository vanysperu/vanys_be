import { RoleStatic } from "../../api/modules/role/model/role.model";
import { UserRoleStatic } from "../../api/modules/user_role/models/user_role.model";
import { UserStatic } from "../../api/modules/users/models/user.model";

export const UserAndRoleManyToMany = ({
  user,
  role,
  userRole,
}: {
  user: UserStatic;
  role: RoleStatic;
  userRole: UserRoleStatic;
}): void => {

  user.belongsToMany(role, {
    through: {
      model: userRole,
      unique: false,
    },
    foreignKey: { allowNull: false, name: "user_id" },
    otherKey: { allowNull: false, name: "role_id" },
  });

  role.belongsToMany(user, {
    through: {
      model: userRole,
      unique: false,
    },
    foreignKey: { allowNull: false, name: "role_id" },
    otherKey: { allowNull: false, name: "user_id" },
  });
};
