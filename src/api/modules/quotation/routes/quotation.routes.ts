import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  changeItemStageValidator,
  changeStatusValidator,
  createQuotationExpenseValidator,
  createQuotationPaymentValidator,
  createQuotationValidator,
  getQuotationValidator,
  updateQuotationValidator,
} from "../validators/quotation.validator";
import {
  changeItemStageController,
  changeQuotationStatusController,
  createQuotationController,
  createQuotationExpenseController,
  createQuotationPaymentController,
  downloadQuotationPdfController,
  getQuotationController,
  listQuotationsController,
  updateQuotationController,
} from "../controllers/quotation.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listQuotationsController);
router.get("/find/:id", verifyAccess, getQuotationValidator, allValidator, getQuotationController);
router.get("/:id/pdf", verifyAccess, getQuotationValidator, allValidator, downloadQuotationPdfController);
router.post("/create", verifyAccess, createQuotationValidator, allValidator, createQuotationController);
router.put("/update/:id", verifyAccess, updateQuotationValidator, allValidator, updateQuotationController);
router.put("/status/:id", verifyAccess, changeStatusValidator, allValidator, changeQuotationStatusController);
router.put("/item/:itemId/stage", verifyAccess, changeItemStageValidator, allValidator, changeItemStageController);
router.post("/:id/payments", verifyAccess, createQuotationPaymentValidator, allValidator, createQuotationPaymentController);
router.post("/:id/expenses", verifyAccess, createQuotationExpenseValidator, allValidator, createQuotationExpenseController);
