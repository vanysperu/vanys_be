export interface MyAccessViewItem {
  id: number;
  module_id: number;
  parent_id: number | null;
  code: string;
  name: string;
  route: string | null;
  icon: string | null;
  show_in_menu: boolean;
  position: number;
  children: MyAccessViewItem[];
}

export interface MyAccessModuleItem {
  id: number;
  code: string;
  name: string;
  icon: string | null;
  position: number;
  views: MyAccessViewItem[];
}

export interface MyAccessResponse {
  modules: string[];
  views: MyAccessModuleItem[];
  buttons: string[];
  // Código de la paleta de marca de la empresa del usuario (ver
  // THEME_COLOR_CODES). "blue" es el valor por defecto de Metronic.
  themeColor: string;
  // Usuario de plataforma (ve/gestiona todas las empresas). El front lo usa
  // solo para UX (ej. ocultar acciones sobre recursos globales a una
  // empresa normal) — la autorización real siempre la revalida el backend.
  isSystem: boolean;
  // Empresa del usuario (null para is_system). Le permite al front saber
  // "mi propia empresa" sin llamar GET /company/list, que sigue siendo
  // exclusivo de is_system (ej. para precargar el formulario de crear
  // tienda de un admin de empresa).
  companyId: number | null;
  // Nombre(s) de rol del usuario autenticado, para mostrar en el bloque de
  // usuario del sidebar (join con `role`, ver getUserRoles en access.service).
  // Si tiene más de un rol activo, se concatenan con coma.
  roleName: string | null;
  // Nombre de la tienda (business_unit) asignada al usuario, si tiene una.
  // El front usa esto (con fallback a companyName) en el bloque de usuario.
  businessUnitName: string | null;
  // Nombre de la empresa del usuario (null solo para is_system sin empresa).
  // Sirve de fallback cuando el usuario no tiene tienda asignada.
  companyName: string | null;
  // Fracción de IGV resuelta para la empresa del usuario (0.18 = 18%, ver
  // quotation/services/shared/tax_config.ts -> getIgvRate). El frontend la
  // usa para la previsualización de "Nueva cotización" antes de guardar —
  // el backend recalcula el total real igual al crear/actualizar.
  igvRate: number;
}
