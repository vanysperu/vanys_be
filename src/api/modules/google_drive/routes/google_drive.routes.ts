import { Router } from "express";
import { param } from "express-validator";
import { verifyAccess } from "../../../../middlewares/user-access";
import { requireSystemRole } from "../../../../middlewares/require-system-role";
import { allValidator } from "../../../../middlewares/error-validator";
import { driveConnectUrlController } from "../controllers/connect_url.controller";
import { driveStatusController } from "../controllers/status.controller";
import { driveDisconnectController } from "../controllers/disconnect.controller";
import { driveCallbackController } from "../controllers/callback.controller";

const companyIdValidator = [param("companyId").isInt({ gt: 0 }).withMessage("La empresa no es válida").toInt()];

// Conectar el Google Drive de una empresa: EXCLUSIVO del Super Administrador
// (pedido explícito del usuario: el almacenamiento de cada empresa lo
// configura solo él). Ver google_drive/README.md.
export const router: Router = Router();

router.get("/connect-url/:companyId", verifyAccess, requireSystemRole, companyIdValidator, allValidator, driveConnectUrlController);
router.get("/status/:companyId", verifyAccess, requireSystemRole, companyIdValidator, allValidator, driveStatusController);
router.put("/disconnect/:companyId", verifyAccess, requireSystemRole, companyIdValidator, allValidator, driveDisconnectController);

// Vuelta de Google: navegación del navegador SIN sesión (Google no manda el
// token del sistema). La protege el `state` firmado con la clave del servidor.
export const publicRouter: Router = Router();

publicRouter.get("/callback", driveCallbackController);
