import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  advertisementIdValidator,
  createAdvertisementValidator,
  disableAdvertisementValidator,
  listAdvertisementsValidator,
  moveAdvertisementValidator,
  updateAdvertisementValidator,
} from "../validators/advertisement.validator";
import { listAdvertisementsController } from "../controllers/list.controller";
import { createAdvertisementController } from "../controllers/create.controller";
import { updateAdvertisementController } from "../controllers/update.controller";
import { moveAdvertisementController } from "../controllers/position.controller";
import { disableAdvertisementController } from "../controllers/disable.controller";
import { deleteAdvertisementController } from "../controllers/delete.controller";
import { uploadAdvertisementImageController } from "../controllers/upload_image.controller";

// Pantalla "Anuncios" (módulo RBAC `advertisement`, ver README.md). Cada ruta
// pasa por verifyAccess: sin su recurso otorgado al rol, responde 403.
export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, listAdvertisementsValidator, allValidator, listAdvertisementsController);
router.post("/image", verifyAccess, uploadAdvertisementImageController);
router.post("/create", verifyAccess, createAdvertisementValidator, allValidator, createAdvertisementController);
router.put("/update/:id", verifyAccess, updateAdvertisementValidator, allValidator, updateAdvertisementController);
router.put("/position/:id", verifyAccess, moveAdvertisementValidator, allValidator, moveAdvertisementController);
router.put("/disable/:id", verifyAccess, disableAdvertisementValidator, allValidator, disableAdvertisementController);
router.delete("/delete/:id", verifyAccess, advertisementIdValidator, allValidator, deleteAdvertisementController);
