import { Router } from "express";
import { listThemesController } from "../controllers/theme.controller";

export const router: Router = Router();

// Sin verifyAccess (mismo patrón que access/routes.ts -> "/me"): catálogo
// cerrado de paletas de marca, cualquier usuario autenticado puede leerlo
// (lo necesita el select de apariencia), solo se inserta/edita por
// migración+seeder (no tiene alta desde la API, es un catálogo fijo).
router.get("/list", listThemesController);
