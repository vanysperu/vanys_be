import { ModuleStatic } from "../../api/modules/module/models/module.model";
import { ResourceStatic } from "../../api/modules/resource/models/resource.model";

export const moduleHasManyResources = ({
  module,
  resource,
}: {
  module: ModuleStatic;
  resource: ResourceStatic;
}): void => {
  module.hasMany(resource, {
    foreignKey: "module_id",
    sourceKey: "id",
  });
  resource.belongsTo(module, {
    foreignKey: "module_id",
    targetKey: "id",
  });
};
