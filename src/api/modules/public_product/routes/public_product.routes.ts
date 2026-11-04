import { Router } from "express";
import { allValidator } from "../../../../middlewares/error-validator";
import { requireApiKey } from "../../../../core/middlewares/requireApiKey";
import {
  bulkProductsValidator,
  listPublicCategoriesValidator,
  listPublicProductsValidator,
} from "../validators/public_product.validator";
import { listPublicCategoriesController } from "../controllers/list_categories.controller";
import { bulkProductsController } from "../controllers/bulk.controller";
import { listPublicProductsController } from "../controllers/list.controller";
import { uploadPublicProductImageController } from "../controllers/upload_image.controller";

// Productos para integraciones sin sesión (API key en X-Api-Key). La key va
// SIEMPRE antes del validator: un request sin key no recibe detalles de
// validación. Ver public_product/README.md.
export const router: Router = Router();

router.get("/products", requireApiKey, listPublicProductsValidator, allValidator, listPublicProductsController);
router.post("/products/images", requireApiKey, uploadPublicProductImageController);
router.post("/products/bulk", requireApiKey, bulkProductsValidator, allValidator, bulkProductsController);
router.get("/product-categories", requireApiKey, listPublicCategoriesValidator, allValidator, listPublicCategoriesController);
