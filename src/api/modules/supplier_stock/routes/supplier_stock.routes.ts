import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { requireCompanyFeature } from "../../../../middlewares/require-company-feature";
import { parseStockUpload } from "../../../../middlewares/upload-stock-file";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  createSourceValidator,
  listSourcesValidator,
  lookupValidator,
  previewValidator,
  searchValidator,
  sourceIdValidator,
  updateSourceValidator,
} from "../validators/supplier_stock.validator";
import { listSourcesController } from "../controllers/list_sources.controller";
import { createSourceController } from "../controllers/create_source.controller";
import { updateSourceController } from "../controllers/update_source.controller";
import { toggleSourceController } from "../controllers/toggle_source.controller";
import { listImportsController } from "../controllers/list_imports.controller";
import { previewSourceController } from "../controllers/preview.controller";
import { refreshSourceController } from "../controllers/refresh_source.controller";
import { lookupStockController } from "../controllers/lookup.controller";
import { searchStockController } from "../controllers/search.controller";

export const router: Router = Router();

// Todo el módulo exige que la empresa tenga contratado "Stock de proveedores".
const feature = requireCompanyFeature("supplier_stock");

// Consulta (quien cotiza).
router.get("/lookup", verifyAccess, feature, lookupValidator, allValidator, lookupStockController);
router.get("/search", verifyAccess, feature, paginationValidator, searchValidator, allValidator, searchStockController);

// Fuentes (configuración).
router.get("/sources", verifyAccess, feature, paginationValidator, listSourcesValidator, allValidator, listSourcesController);
router.post("/sources", verifyAccess, feature, createSourceValidator, allValidator, createSourceController);
router.put("/sources/:id", verifyAccess, feature, updateSourceValidator, allValidator, updateSourceController);
router.put("/sources/:id/disable", verifyAccess, feature, sourceIdValidator, allValidator, toggleSourceController);
router.get("/sources/:id/imports", verifyAccess, feature, sourceIdValidator, paginationValidator, allValidator, listImportsController);
router.post("/sources/:id/refresh", verifyAccess, feature, parseStockUpload, sourceIdValidator, allValidator, refreshSourceController);
router.post("/preview", verifyAccess, feature, parseStockUpload, previewValidator, allValidator, previewSourceController);
