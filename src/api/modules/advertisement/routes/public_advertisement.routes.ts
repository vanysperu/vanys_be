import { Router } from "express";
import { allValidator } from "../../../../middlewares/error-validator";
import { requireApiKey } from "../../../../core/middlewares/requireApiKey";
import { listPublicAdvertisementsValidator } from "../validators/advertisement.validator";
import { listPublicAdvertisementsController } from "../controllers/public_list.controller";

// Anuncios para la web pública (sin sesión): API key en la cabecera X-Api-Key.
// La empresa sale de la key. La key va ANTES del validator: sin key no hay
// detalles de validación. Ver advertisement/README.md.
export const router: Router = Router();

router.get("/advertisements", requireApiKey, listPublicAdvertisementsValidator, allValidator, listPublicAdvertisementsController);
