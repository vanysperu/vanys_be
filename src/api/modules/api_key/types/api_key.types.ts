// Contexto que deja `requireApiKey` en `req.apiKey`: de acá (y NUNCA del
// body) salen la empresa y la tienda de lo que haga la integración.
export interface ApiKeyContext {
  id: number;
  name: string;
  companyId: number;
  businessUnitId: number | null;
  // Usuario que emitió la key: queda como autor de lo que exige un usuario
  // real (ej. los avisos de Recordatorios, cuyo `created_by` es obligatorio).
  issuedBy: number;
}

// `requireApiKey` deja el contexto en `req.apiKey` (solo en las rutas que lo
// usan; en el resto queda undefined).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKeyContext;
    }
  }
}

// ---------------------------------------------------------------------------
// Gestión de keys (pantalla "API keys", exclusiva del Super Administrador).
// ---------------------------------------------------------------------------

export type ApiKeyStatusFilter = "active" | "revoked" | "all";

export interface ApiKeyListFilter {
  page: number;
  limit: number;
  companyId?: number;
  status: ApiKeyStatusFilter;
  name?: string;
}

export interface CreateApiKeyDto {
  company_id: number;
  business_unit_id?: number | null;
  name: string;
  // Empresas EXTRA a las que la key puede replicar productos en la subida
  // masiva (además de la suya). Vacío = solo su empresa.
  replicate_company_ids?: number[];
}

export interface UpdateApiKeyDto {
  name?: string;
  business_unit_id?: number | null;
  // Reemplaza la lista completa; undefined = no se toca.
  replicate_company_ids?: number[];
}

// Fecha y hora de Lima separadas (regla de fechas del proyecto).
export interface LocalDateTime {
  date: string;
  time: string;
}

// Lo que ve la pantalla: nunca el hash, solo el prefijo para reconocerla.
export interface ApiKeyDto {
  id: number;
  name: string;
  key_prefix: string;
  company: { id: number; name: string };
  business_unit: { id: number; code: string } | null;
  is_revoked: boolean;
  last_used_at: LocalDateTime | null;
  created_at: LocalDateTime;
  created_by: { id: number; name: string } | null;
  revoked_at: LocalDateTime | null;
  // Empresas extra a las que puede replicar productos.
  replicate_companies: { id: number; name: string }[];
}

// Respuesta de crear: la key en texto plano viaja UNA sola vez.
export interface CreatedApiKeyDto extends ApiKeyDto {
  plain_key: string;
}
