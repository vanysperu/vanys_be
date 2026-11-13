import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { requireCompanyFeature } from "../../../../middlewares/require-company-feature";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  cancelDocumentValidator,
  companyQueryValidator,
  createDocumentValidator,
  idValidator,
  kardexValidator,
  listDocumentsValidator,
  listStockValidator,
  listWarehousesValidator,
  receiveTransferValidator,
  stockByProductsValidator,
  storeSettingsValidator,
  suggestLotsValidator,
  tracksStockValidator,
  updateDocumentValidator,
  updateWarehouseValidator,
  warehouseValidator,
} from "../validators/inventory.validator";
import { listWarehousesController } from "../controllers/list_warehouses.controller";
import { createWarehouseController } from "../controllers/create_warehouse.controller";
import { updateWarehouseController } from "../controllers/update_warehouse.controller";
import { toggleWarehouseController } from "../controllers/toggle_warehouse.controller";
import { listStoresController } from "../controllers/list_stores.controller";
import { updateStoreController } from "../controllers/update_store.controller";
import { setTracksStockController } from "../controllers/set_tracks_stock.controller";
import { listStockController } from "../controllers/list_stock.controller";
import { stockByProductsController } from "../controllers/stock_by_products.controller";
import { kardexController } from "../controllers/kardex.controller";
import { suggestLotsController } from "../controllers/suggest_lots.controller";
import { listDocumentsController } from "../controllers/list_documents.controller";
import { getDocumentController } from "../controllers/get_document.controller";
import { createDocumentController } from "../controllers/create_document.controller";
import { updateDocumentController } from "../controllers/update_document.controller";
import { postDocumentController } from "../controllers/post_document.controller";
import { cancelDocumentController } from "../controllers/cancel_document.controller";
import { dispatchTransferController } from "../controllers/dispatch_transfer.controller";
import { receiveTransferController } from "../controllers/receive_transfer.controller";

export const router: Router = Router();

// Todo el módulo exige que la empresa tenga contratado el inventario.
const guard = [verifyAccess, requireCompanyFeature("inventory")];

// Almacenes y configuración.
router.get("/warehouses", ...guard, paginationValidator, listWarehousesValidator, allValidator, listWarehousesController);
router.post("/warehouses", ...guard, warehouseValidator, allValidator, createWarehouseController);
router.put("/warehouses/:id", ...guard, updateWarehouseValidator, allValidator, updateWarehouseController);
router.put("/warehouses/:id/disable", ...guard, idValidator, allValidator, toggleWarehouseController);
router.get("/stores", ...guard, paginationValidator, companyQueryValidator, allValidator, listStoresController);
router.put("/stores/:id", ...guard, storeSettingsValidator, allValidator, updateStoreController);
router.put("/products/tracks-stock", ...guard, tracksStockValidator, allValidator, setTracksStockController);

// Consultas.
router.get("/stock", ...guard, paginationValidator, listStockValidator, allValidator, listStockController);
router.get("/stock/by-products", ...guard, stockByProductsValidator, allValidator, stockByProductsController);
router.get("/kardex", ...guard, paginationValidator, kardexValidator, allValidator, kardexController);
router.get("/lots/suggest", ...guard, suggestLotsValidator, allValidator, suggestLotsController);

// Documentos.
router.get("/documents", ...guard, paginationValidator, listDocumentsValidator, allValidator, listDocumentsController);
router.get("/documents/:id", ...guard, idValidator, allValidator, getDocumentController);
router.post("/documents", ...guard, createDocumentValidator, allValidator, createDocumentController);
router.put("/documents/:id", ...guard, updateDocumentValidator, allValidator, updateDocumentController);
router.post("/documents/:id/post", ...guard, idValidator, allValidator, postDocumentController);
router.post("/documents/:id/cancel", ...guard, cancelDocumentValidator, allValidator, cancelDocumentController);
router.post("/documents/:id/dispatch", ...guard, idValidator, allValidator, dispatchTransferController);
router.post("/documents/:id/receive", ...guard, receiveTransferValidator, allValidator, receiveTransferController);
