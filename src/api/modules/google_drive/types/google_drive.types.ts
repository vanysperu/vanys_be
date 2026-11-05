export interface LocalDateTime {
  date: string;
  time: string;
}

// Estado del almacenamiento de facturas de una empresa (pantalla Empresas).
export interface DriveStatusDto {
  // El servidor tiene las variables GOOGLE_DRIVE_*.
  configured: boolean;
  // Dónde guarda facturas la empresa.
  storage_system: boolean;
  storage_drive: boolean;
  connected: boolean;
  email: string | null;
  connected_at: LocalDateTime | null;
  // null si no está conectado o no se pudo consultar. limit null = ilimitado.
  quota: { limit_bytes: number | null; usage_bytes: number } | null;
  error: string | null;
}
