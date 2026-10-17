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
  legal_terms_caption?: string | null;
}
