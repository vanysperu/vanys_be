import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  createPurchaseOrderItemPurchaseValidator,
  createPurchaseOrderValidator,
  purchaseOrderIdValidator,
  updatePurchaseOrderItemStatusValidator,
} from "../validators/purchase_order.validator";
import {
  createPurchaseOrderController,
  createPurchaseOrderItemPurchaseController,
  getPurchaseOrderController,
  listPurchaseOrdersController,
  updatePurchaseOrderItemStatusController,
} from "../controllers/purchase_order.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listPurchaseOrdersController);
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
