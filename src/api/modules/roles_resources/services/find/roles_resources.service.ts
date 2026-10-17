import { DataBase } from "../../../../../database";
import { buildTree } from "../../../../../utils/object";
import { ModuleTreeItem, ResourceTreeItem, RoleResourceTreeResponse } from "../../interfaces/roles_resources.interface";
import { ModuleModel } from "../../../module/models/module.model";
import { ResourceModel } from "../../../resource/models/resource.model";
import { RolesResourcesModel } from "../../models/roles_resources.model";

/**
 * Árbol Módulos -> Recursos (vistas/botones/endpoints) para un rol, marcando
 * qué recursos ya tiene otorgados (`granted`). Si el rol es `is_system`, se
 * considera con TODOS los recursos activos otorgados (evita que el admin
 * quede bloqueado por falta de filas en roles_resources).
 */
export const getRoleResourceTree = async (roleId: number): Promise<RoleResourceTreeResponse> => {
  const role = await DataBase.instance.role.findOne({ where: { id: roleId } });
  if (!role) throw new Error("El rol con el ID proporcionado no existe.");

  const [modules, resources, grantedRows] = await Promise.all([
    DataBase.instance.module.findAll({ where: { active: 1 }, order: [["position", "ASC"]] }),
    DataBase.instance.resource.findAll({ where: { active: 1 }, order: [["position", "ASC"]] }),
    DataBase.instance.rolesResources.findAll({ where: { role_id: roleId } }),
  ]);

  const isSystem = Boolean(role.is_system);
  const grantedIds = new Set(grantedRows.map((row: RolesResourcesModel) => row.resource_id));

  const resourceItems: ResourceTreeItem[] = resources.map((resource: ResourceModel) => ({
    id: resource.id,
    module_id: resource.module_id,
    parent_id: resource.parent_id,
    type: resource.type,
    code: resource.code,
    name: resource.name,
    route: resource.route,
    verb: resource.verb,
    icon: resource.icon,
    show_in_menu: resource.show_in_menu,
    position: resource.position,
    granted: isSystem || grantedIds.has(resource.id),
    children: [],
  }));

  const modulesTree: ModuleTreeItem[] = modules.map((module: ModuleModel) => {
    const ownResources = resourceItems.filter((resource) => resource.module_id === module.id);
    const tree = buildTree<ResourceTreeItem>(
      ownResources,
      (item) => item.id,
      (item) => item.parent_id
    );

    return {
      id: module.id,
      code: module.code,
      name: module.name,
      icon: module.icon,
      position: module.position,
      resources: tree,
    };
  });

  return {
    role: { id: role.id, name: role.name },
    modules: modulesTree,
  };
};
