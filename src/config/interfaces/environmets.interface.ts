export interface TKEnvironments {
  PORT?: string;
  MODE?: string;
  PROY_BD?: string;
  PROY_BD_HOST?: string;
  PROY_BD_USER?: string;
  PROY_BD_PASS?: string;
  PROY_BD_PORT?: string;
  SECRET_HIDDEN_KEY?: string;
  DIR: string;
  CLIENT_ID?: string;
  SENDGRID_KEY?: string;
  PROY_BEURL?: string;
  PROY_FEURL?: string;
  PROY_EXTERNAL?: string;
  DIR_ASSETS?: string;

  ONE_SIGNAL_APP_ID?: string;
  ONE_SIGNAL_API_KEY?: string;

  // KOMMO - Configuración para envío de mensajes (Chat API v2)
  KOMMO_API_URL?: string;
  KOMMO_API_KEY?: string;
  // Chat API v2 - Canal registrado
  KOMMO_CHANNEL_ID?: string; // ID del canal registrado
  KOMMO_SECRET_KEY?: string; // Secret key del canal (para firma SHA1)
  KOMMO_SCOPE_ID?: string; // Scope ID obtenido al conectar el canal
}
