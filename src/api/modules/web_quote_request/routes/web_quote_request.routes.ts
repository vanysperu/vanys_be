import { Router } from "express";
import { allValidator } from "../../../../middlewares/error-validator";
import { requireApiKey } from "../../../../core/middlewares/requireApiKey";
import { createWebQuoteRequestValidator } from "../validators/web_quote_request.validator";
import { createWebQuoteRequestController } from "../controllers/create.controller";

// Rutas para integraciones sin sesión (la web pública de la empresa). No
// pasan por authenticateJwt ni por RBAC de usuario: las protege la API key
// (cabecera X-Api-Key), que además fija la empresa y la tienda. La key va
// ANTES del validator, así un request sin key no recibe detalles de
// validación.
export const router: Router = Router();

router.post("/quotation-request", requireApiKey, createWebQuoteRequestValidator, allValidator, createWebQuoteRequestController);
