export interface CreateBusinessUnitDto {
  business_code: string;
  logo_url?: string;
  address?: string | null;
  primary_color?: string;
  secondary_color?: string;
  company_id: number;
}

export interface UpdateBusinessUnitDto {
  business_code?: string;
  logo_url?: string;
  address?: string | null;
  primary_color?: string;
  secondary_color?: string;
  working_days?: string | null;
  opens_at?: string | null;
  closes_at?: string | null;
}
