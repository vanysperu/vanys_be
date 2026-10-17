import * as dotenv from "dotenv";
import path from "path";
import { PROJECT_ROOT } from "./paths";
import { BUSINESS_TIME_ZONE } from "../utils/dateUtils";

// Este módulo se importa PRIMERO en src/index.ts: todo lo demás (config,
// base de datos, rutas de subidas) lee process.env al cargarse, así que las
// variables y la zona horaria tienen que estar listas antes.

// En el hosting las variables suelen cargarse desde su panel; si además
// existe un .env en la raíz del proyecto, se usa como complemento (dotenv
// nunca pisa una variable que ya venga del entorno).
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

// Todo el negocio opera en Perú (soles, IGV, RUC) y CLAUDE.md fija UTC-5.
// Las máquinas de desarrollo ya están en America/Lima, pero un servidor de
// hosting suele estar en UTC: sin esto, el PDF imprimía la fecha de emisión
// y la hora de "Generado el" corridas 5 horas, y el job de vencimiento
// vencía cotizaciones a las 7 p. m. de Lima en vez de a medianoche. Se fija
// la zona del PROCESO para que producción se comporte exactamente igual que
// donde se probó. No afecta lo que se guarda en la base: Sequelize escribe y
// lee los DATETIME siempre en UTC (+00:00, su configuración por defecto).
process.env.TZ = BUSINESS_TIME_ZONE;
