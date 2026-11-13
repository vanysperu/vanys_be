// Proveedor tal como sale hacia el frontend (fechas en hora de negocio).
export interface SupplierDto {
  id: number;
  company_id: number;
  document_type: number | null;
  document_number: string | null;
  name: string;
  trade_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  is_carrier: boolean;
  mtc_registration: string | null;
  active: boolean;
  createdAt: { date: string; time: string };
}

export interface SupplierInput {
  document_type?: number | null;
  document_number?: string | null;
  name: string;
  trade_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  is_carrier?: boolean;
  mtc_registration?: string | null;
}

export interface ListSuppliersParams {
  // null = todas las empresas (Super Administrador sin empresa elegida).
  companyId: number | null;
  page: number;
  limit: number;
  orderBy: string;
  orderDir: "asc" | "desc";
  searchTerm?: string;
  // "active" | "inactive"; sin valor = todos.
  status?: string;
}
