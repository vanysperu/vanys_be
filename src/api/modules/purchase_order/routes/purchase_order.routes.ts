import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  correctPurchaseValidator,
  createPurchaseOrderItemPurchaseValidator,
  createPurchaseOrderValidator,
  purchaseCorrectionsValidator,
  purchaseIdValidator,
  annulPurchaseValidator,
  purchaseOrderIdValidator,
  updatePurchaseOrderItemStatusValidator,
} from "../validators/purchase_order.validator";
import {
  annulPurchaseController,
  correctPurchaseController,
  findPurchaseController,
  listPurchaseCorrectionsController,
  createPurchaseOrderController,
  createPurchaseOrderItemPurchaseController,
  getPurchaseOrderController,
  listPurchaseOrdersController,
  updatePurchaseOrderItemStatusController,
} from "../controllers/purchase_order.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listPurchaseOrdersController);
// Compras: corregir / anular / historial. Rutas que empiezan con "purchase",
// así no las tapa ninguna "/:param/...".
router.get("/purchase/find/:id", verifyAccess, purchaseIdValidator, allValidator, findPurchaseController);
router.put("/purchase/update/:id", verifyAccess, correctPurchaseValidator, allValidator, correctPurchaseController);
router.put("/purchase/disable/:id", verifyAccess, annulPurchaseValidator, allValidator, annulPurchaseController);
router.get(
  "/purchase/:id/corrections",
  verifyAccess,
  purchaseCorrectionsValidator,
  allValidator,
  listPurchaseCorrectionsController
);
router.get("/find/:id", verifyAccess, purchaseOrderIdValidator, allValidator, getPurchaseOrderController);
router.post("/create", verifyAccess, createPurchaseOrderValidator, allValidator, createPurchaseOrderController);
router.put(
  "/item/:itemId/status",
  verifyAccess,
  updatePurchaseOrderItemStatusValidator,
  allValidator,
  updatePurchaseOrderItemStatusController
);
router.post(
  "/item/:itemId/purchases",
  verifyAccess,
  createPurchaseOrderItemPurchaseValidator,
  allValidator,
  createPurchaseOrderItemPurchaseController
);
