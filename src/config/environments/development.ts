import path from 'path'

export interface Development {
  PORT?: string
  MODE: string
  PROY_BD?: string
  PROY_BD_HOST?: string
  PROY_BD_USER?: string
  PROY_BD_PASS?: string
  PROY_BD_PORT?: string
  SECRET_HIDDEN_KEY?: string
  DIR: string
  CLIENT_ID?: string
  SENDGRID_KEY?: string
  PROY_BEURL?: string
  PROY_FEURL?: string
  PROY_EXTERNAL?: string
  DIR_ASSETS?: string

  ONE_SIGNAL_APP_ID?: string
  ONE_SIGNAL_API_KEY?: string

  // KOMMO - Configuración para envío de mensajes (Chat API v2)
  KOMMO_API_URL?: string
  KOMMO_API_KEY?: string
  // Chat API v2 - Canal registrado
  KOMMO_CHANNEL_ID?: string // ID del canal registrado
  KOMMO_SECRET_KEY?: string // Secret key del canal (para firma SHA1)
  KOMMO_SCOPE_ID?: string // Scope ID obtenido al conectar el canal
}

export const development: Development = {
  MODE: 'ENVIRONMENT',

  PORT: process.env.PROY_APP_PORT,

  PROY_BD: process.env.PROY_BD,
  PROY_BD_HOST: process.env.PROY_BD_HOST,
  PROY_BD_USER: process.env.PROY_BD_USER,
  PROY_BD_PASS: process.env.PROY_BD_PASS,
  PROY_BD_PORT: process.env.PROY_BD_PORT,

  SECRET_HIDDEN_KEY: process.env.SECRET_HIDDEN_KEY,

  CLIENT_ID: process.env.CLIENT_ID,

  DIR: path.join(__dirname, '../../'),
  DIR_ASSETS: path.join(__dirname, '../../', 'assets'),
  SENDGRID_KEY: process.env.SENDGRID_KEY,

  PROY_BEURL: process.env.PROY_BEURL,
  PROY_FEURL: process.env.PROY_FEURL,

  PROY_EXTERNAL: process.env.PROY_EXTERNAL,
  
  ONE_SIGNAL_APP_ID: process.env.ONE_SIGNAL_APP_ID,
  ONE_SIGNAL_API_KEY: process.env.ONE_SIGNAL_API_KEY,

  // KOMMO - Configuración para envío de mensajes (Chat API v2)
  KOMMO_API_URL: process.env.KOMMO_API_URL,
  KOMMO_API_KEY: process.env.KOMMO_API_KEY,
  // Chat API v2 - Canal registrado
  KOMMO_CHANNEL_ID: process.env.KOMMO_CHANNEL_ID,
  KOMMO_SECRET_KEY: process.env.KOMMO_SECRET_KEY,
  KOMMO_SCOPE_ID: process.env.KOMMO_SCOPE_ID,
}
