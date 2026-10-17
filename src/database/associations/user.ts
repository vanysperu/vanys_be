import { TokenStatic } from "../../api/modules/token/models/token.model";
import { UserStatic } from "../../api/modules/users/models/user.model";

export const userHasManyTokens = ({
  user,
  token,
}: {
  user: UserStatic;
  token: TokenStatic;
}): void => {
  user.hasMany(token, {
    foreignKey: "user_id",
    sourceKey: "id",
  });
  token.belongsTo(user, {
    foreignKey: "user_id",
    targetKey: "id",
  });
};
