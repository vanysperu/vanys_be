import { ResourceStatic } from "../../api/modules/resource/models/resource.model";

export const resourceHasManyChildren = ({ resource }: { resource: ResourceStatic }): void => {
  resource.hasMany(resource, {
    as: "children",
    foreignKey: "parent_id",
    sourceKey: "id",
  });
  resource.belongsTo(resource, {
    as: "parent",
    foreignKey: "parent_id",
    targetKey: "id",
  });
};
