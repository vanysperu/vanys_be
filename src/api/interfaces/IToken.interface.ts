export interface AllowedRoute {
  route: string;
  verb: string;
}

export interface IToken {
  userId: number;
  rolesId: number[];
  allowedRoutes: AllowedRoute[];
  companyId: number | null;
  businessUnitId: number | null;
  isSystem: boolean;
  mustChangePassword: boolean;
  // Permiso "roles_access.viewAllBusinessUnits.button" (o is_system): si es
  // false y el usuario tiene businessUnitId propio, queda limitado a esa
  // tienda en clientes/cotizaciones/usuarios (ver core/rbac/businessUnitScope.ts).
  canViewAllBusinessUnits: boolean;
}
