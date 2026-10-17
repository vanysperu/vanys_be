import { Router } from "express";
import { getMyAccessController } from "../controllers/access.controller";

export const router: Router = Router();

// Sin verifyAccess: cualquier usuario autenticado puede consultar sus propios
// accesos (es la base para armar su propio sidebar/guard de rutas).
router.get("/me", getMyAccessController);
