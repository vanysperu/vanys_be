// Forma estándar de TODA respuesta de la API (CLAUDE.md sección 5) — el
// frontend implementa un único parser genérico gracias a este contrato.
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: unknown; // detalle de validación, etc.
  code?: string; // código estable para el front (ej. 'VALIDATION_ERROR', 'NOT_FOUND')
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
