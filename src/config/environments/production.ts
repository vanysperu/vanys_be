import path from "path";
import { TKEnvironments } from "../interfaces/environmets.interface";

export interface Production extends TKEnvironments {}

export const production: Production = {
  MODE: process.env.NODE_ENV,

  PORT: process.env.PROY_APP_PORT,

  PROY_BD: process.env.PROY_BD || "grulla_be",
  PROY_BD_HOST: process.env.PROY_BD_HOST,
  PROY_BD_USER: process.env.PROY_BD_USER,
  PROY_BD_PASS: process.env.PROY_BD_PASS,
  PROY_BD_PORT: process.env.PROY_BD_PORT,

  SECRET_HIDDEN_KEY: process.env.SECRET_HIDDEN_KEY,

  CLIENT_ID: process.env.CLIENT_ID,

  DIR: path.join(__dirname, "../../"),
  DIR_ASSETS: path.join(__dirname, "../../", "assets"),

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
};
