import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildTree } from "../../../../../utils/object";
import { MyAccessModuleItem, MyAccessResponse, MyAccessViewItem } from "../../interfaces/access.interface";
import { ModuleModel } from "../../../module/models/module.model";
import { ResourceModel } from "../../../resource/models/resource.model";
import { RolesResourcesModel } from "../../../roles_resources/models/roles_resources.model";
import { getIgvRate } from "../../../quotation/services/shared/tax_config";
import { isSystemOnlyModule, isSystemOnlyResource } from "../../../../../core/rbac/systemOnlyModules";

const getUserRoles = async (userId: number) => {
  const query = `
    select r.id, r.is_system, r.name from role r
    inner join user_role ur on r.id = ur.role_id
    where ur.user_id = ? and r.status = true
  `;

  return (await DataBase.instance.sequelize.query(query, {
    replacements: [userId],
    type: QueryTypes.SELECT,
  })) as { id: number; is_system: boolean; name: string }[];
};

// Nombre de la tienda (business_unit) asignada al usuario, si tiene una.
// Reutiliza el mismo find puntual por id que ya usa getCompanyThemeColor,
// en vez de inventar un join nuevo para un solo campo.
const getBusinessUnitName = async (businessUnitId: number | null): Promise<string | null> => {
  if (!businessUnitId) return null;

  const businessUnit = await DataBase.instance.business_unit.findOne({
    where: { id: businessUnitId },
    attributes: ["business_code"],
  });

  return businessUnit?.business_code ?? null;
};

const getCompanyName = async (companyId: number | null): Promise<string | null> => {
  if (!companyId) return null;

  const company = await DataBase.instance.company.findOne({
    where: { id: companyId },
    attributes: ["business_name"],
  });

  return company?.business_name ?? null;
};

/**
 * Combina TODOS los roles del usuario (a diferencia del viejo servicio de menú,
 * que solo miraba el primer rol) para armar módulos/vistas/botones otorgados.
 * Si alguno de sus roles es `is_system`, se considera con acceso total.
 */
const DEFAULT_THEME_COLOR = "blue";

const getCompanyThemeColor = async (companyId: number | null): Promise<string> => {
  if (!companyId) return DEFAULT_THEME_COLOR;

  const company = await DataBase.instance.company.findOne({
    where: { id: companyId },
    attributes: ["theme_color"],
  });

  return company?.theme_color || DEFAULT_THEME_COLOR;
};

export const getMyAccess = async (
  userId: number,
  companyId: number | null = null,
  businessUnitId: number | null = null
): Promise<MyAccessResponse> => {
  const roles = await getUserRoles(userId);
  const isSystem = roles.some((role) => Boolean(role.is_system));
  const roleIds = roles.map((role) => role.id);
  const roleName = roles.length > 0 ? roles.map((role) => role.name).join(", ") : null;

  const [themeColor, businessUnitName, companyName, igvRate] = await Promise.all([
    getCompanyThemeColor(companyId),
    getBusinessUnitName(businessUnitId),
    getCompanyName(companyId),
    getIgvRate(companyId),
  ]);

  if (roleIds.length === 0) {
    return {
      modules: [],
      views: [],
      buttons: [],
      themeColor,
      isSystem,
      companyId,
      roleName,
      businessUnitName,
      businessUnitId,
      companyName,
      igvRate,
    };
  }

  const [modules, resources] = await Promise.all([
    DataBase.instance.module.findAll({ where: { active: 1 }, order: [["position", "ASC"]] }),
    DataBase.instance.resource.findAll({ where: { active: 1 }, order: [["position", "ASC"]] }),
  ]);

  let grantedIds: Set<number>;

  if (isSystem) {
    grantedIds = new Set(resources.map((resource: ResourceModel) => resource.id));
  } else {
    const grantedRows = await DataBase.instance.rolesResources.findAll({
      where: { role_id: roleIds },
    });
    grantedIds = new Set(grantedRows.map((row: RolesResourcesModel) => row.resource_id));
  }

  // Los módulos exclusivos del Super Administrador (core/rbac/systemOnlyModules)
  // nunca llegan al menú de un usuario de empresa, aunque su rol conserve
  // filas viejas en roles_resources. La excepción ("Ver todas las tiendas")
  // sigue llegando como botón, pero sin arrastrar su módulo al menú.
  const moduleCodeById = new Map<number, string>(modules.map((module: ModuleModel) => [module.id, module.code]));
  const grantedResources = resources.filter(
    (resource: ResourceModel) =>
      grantedIds.has(resource.id) && (isSystem || !isSystemOnlyResource(moduleCodeById.get(resource.module_id), resource.code))
  );

  const grantedModuleIds = new Set(
    grantedResources
      .map((resource: ResourceModel) => resource.module_id)
      .filter((moduleId: number) => isSystem || !isSystemOnlyModule(moduleCodeById.get(moduleId)))
  );
  const grantedModules = modules.filter((module: ModuleModel) => grantedModuleIds.has(module.id));

  const views: MyAccessModuleItem[] = grantedModules
    .map((module: ModuleModel) => {
      const moduleViews = grantedResources.filter(
        (resource: ResourceModel) => resource.module_id === module.id && resource.type === "view"
      );

      const viewItems: MyAccessViewItem[] = moduleViews.map((resource: ResourceModel) => ({
        id: resource.id,
        module_id: resource.module_id,
        parent_id: resource.parent_id,
        code: resource.code,
        name: resource.name,
        route: resource.route,
        icon: resource.icon,
        show_in_menu: resource.show_in_menu,
        position: resource.position,
        children: [],
      }));

      const tree = buildTree<MyAccessViewItem>(
        viewItems,
        (item) => item.id,
        (item) => item.parent_id
      );

      return {
        id: module.id,
        code: module.code,
        name: module.name,
        icon: module.icon,
        position: module.position,
        views: tree,
      };
    })
    .filter((module) => module.views.length > 0);

  const buttons = grantedResources
    .filter((resource: ResourceModel) => resource.type === "button")
    .map((resource: ResourceModel) => resource.code);

  return {
    modules: grantedModules.map((module: ModuleModel) => module.code),
    views,
    buttons,
    themeColor,
    isSystem,
    companyId,
    roleName,
    businessUnitName,
    businessUnitId,
    companyName,
    igvRate,
  };
};
