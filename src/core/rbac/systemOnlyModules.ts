// Módulos EXCLUSIVOS del Super Administrador (pedido explícito del usuario:
// "solo el super admin vea lo de módulos y accesos de roles"). "roles_access"
// es la pantalla de Roles y accesos, que además administra el catálogo de
// Módulos y Recursos.
//
// Exclusivo significa, en el backend (el frontend solo refleja):
//   - no aparece en el menú de un usuario que no es de plataforma
//     (access.service), aunque su rol tuviera filas viejas otorgadas;
//   - no se le puede otorgar a un rol que no es de plataforma, ni siquiera
//     desde la cuenta del Super Administrador (roles_resources);
//   - sus endpoints de escritura exigen requireSystemRole.
export const SYSTEM_ONLY_MODULE_CODES = ["roles_access"] as const;

// Excepción: "Ver todas las tiendas" vive (por historia) dentro de
// roles_access, pero NO es una pantalla: es un permiso de alcance de datos que
// el Super Administrador sí otorga a roles de empresa (ej. un Gestor que debe
// ver todas las tiendas). Ver core/rbac/businessUnitScope.ts.
export const SYSTEM_ONLY_EXCEPTION_CODES = ["roles_access.viewAllBusinessUnits.button"] as const;

const systemOnlyModules = new Set<string>(SYSTEM_ONLY_MODULE_CODES);
const exceptionCodes = new Set<string>(SYSTEM_ONLY_EXCEPTION_CODES);

export const isSystemOnlyModule = (moduleCode: string | null | undefined): boolean =>
  Boolean(moduleCode && systemOnlyModules.has(moduleCode));

// ¿Este recurso está vedado para roles/usuarios que no son de plataforma?
export const isSystemOnlyResource = (moduleCode: string | null | undefined, resourceCode: string): boolean =>
  isSystemOnlyModule(moduleCode) && !exceptionCodes.has(resourceCode);
