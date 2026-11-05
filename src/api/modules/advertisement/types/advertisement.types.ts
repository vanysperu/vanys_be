// Tipos del módulo de anuncios (advertisement/README.md).

export type AdvertisementStatusFilter = "active" | "inactive" | "all";

export interface LocalDateTime {
  date: string;
  time: string;
}

// Quién hace la acción: lo arma el controller desde la sesión, nunca del body.
export interface AdvertisementActor {
  userId: number;
  isSystem: boolean;
  companyId: number | null;
}

// Zona (lugar de la web): fila de Variables Generales con category
// "advertisement_zone". `code` (su "Código") es lo que manda la web.
export interface AdvertisementZoneRef {
  id: number;
  code: string;
  name: string;
}

export interface AdvertisementDto {
  id: number;
  company_id: number;
  // Para la columna "Empresa" del Super Administrador.
  company_name: string | null;
  zone: (AdvertisementZoneRef & { is_active: boolean }) | null;
  title: string;
  link_url: string | null;
  image_path: string;
  // Orden dentro de su zona (1 = primero).
  position: number;
  // Cuántos anuncios hay en su zona: el panel no ofrece "bajar" al último.
  zone_total: number;
  is_active: boolean;
  created_at: LocalDateTime;
  updated_at: LocalDateTime | null;
}

// Filtro de zona del panel: una zona, "none" (sin zona) o todas (undefined).
export type AdvertisementZoneFilter = number | "none" | undefined;

export interface AdvertisementListFilter {
  // null = todas las empresas (solo el Super Administrador).
  companyId: number | null;
  zone: AdvertisementZoneFilter;
  status: AdvertisementStatusFilter;
  title?: string;
  page: number;
  limit: number;
}

export interface CreateAdvertisementInput {
  companyId: number;
  zone_id?: number | null;
  title: string;
  link_url?: string | null;
  image_path: string;
  is_active?: boolean;
}

// `undefined` = no se mandó (se conserva). `link_url` null o "" lo quita;
// `zone_id` null lo deja sin zona.
export interface UpdateAdvertisementInput {
  zone_id?: number | null;
  title?: string;
  link_url?: string | null;
  image_path?: string;
  position?: number;
}

// Lo que ve la web: sin datos internos (empresa, auditoría, estado).
export interface PublicAdvertisementDto {
  id: number;
  title: string;
  link_url: string | null;
  // URL absoluta de la imagen.
  image_url: string;
  zone: AdvertisementZoneRef | null;
  position: number;
}
