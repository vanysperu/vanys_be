export interface CreateCompanyDto {
  ruc: string;
  business_name: string;
  description?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  tagline?: string | null;
  logo_url?: string | null;
  theme_color?: string;
  product_images_enabled?: boolean;
}

export interface UpdateCompanyDto {
  ruc?: string;
  business_name?: string;
  description?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  tagline?: string | null;
  logo_url?: string | null;
  theme_color?: string;
  product_images_enabled?: boolean;
  invoice_storage_system?: boolean;
  invoice_storage_drive?: boolean;
  legal_terms_caption?: string | null;
}
