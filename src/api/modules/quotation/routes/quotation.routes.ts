import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  changeItemStageValidator,
  changeStatusValidator,
  completeQuotationValidator,
  createQuotationExpenseValidator,
  createQuotationPaymentValidator,
  correctQuotationExpenseValidator,
  createQuotationValidator,
  getQuotationValidator,
  quotationExpenseCorrectionsValidator,
  quotationExpenseIdValidator,
  toggleQuotationExpenseValidator,
  updateQuotationValidator,
} from "../validators/quotation.validator";
import {
  changeItemStageController,
  changeQuotationStatusController,
  correctQuotationExpenseController,
  createQuotationController,
  findQuotationExpenseController,
  listQuotationExpenseCorrectionsController,
  toggleQuotationExpenseController,
  createQuotationExpenseController,
  createQuotationPaymentController,
  downloadQuotationPdfController,
  getQuotationController,
  listQuotationsController,
  updateQuotationController,
} from "../controllers/quotation.controller";
import { completeQuotationController } from "../controllers/complete.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listQuotationsController);
// Gastos manuales: corregir / anular-restaurar / historial. Rutas de 3
// segmentos que empiezan con "expense", así no las tapa ninguna "/:id/...".
router.get("/expense/find/:id", verifyAccess, quotationExpenseIdValidator, allValidator, findQuotationExpenseController);
router.put("/expense/update/:id", verifyAccess, correctQuotationExpenseValidator, allValidator, correctQuotationExpenseController);
router.put("/expense/disable/:id", verifyAccess, toggleQuotationExpenseValidator, allValidator, toggleQuotationExpenseController);
router.get(
  "/expense/:id/corrections",
  verifyAccess,
  quotationExpenseCorrectionsValidator,
  allValidator,
  listQuotationExpenseCorrectionsController
);
router.get("/find/:id", verifyAccess, getQuotationValidator, allValidator, getQuotationController);
router.get("/:id/pdf", verifyAccess, getQuotationValidator, allValidator, downloadQuotationPdfController);
router.post("/create", verifyAccess, createQuotationValidator, allValidator, createQuotationController);
router.put("/update/:id", verifyAccess, updateQuotationValidator, allValidator, updateQuotationController);
router.put("/status/:id", verifyAccess, changeStatusValidator, allValidator, changeQuotationStatusController);
router.put("/item/:itemId/stage", verifyAccess, changeItemStageValidator, allValidator, changeItemStageController);
// Completar una cotización "Pendiente de cotizar" (llegó desde la web).
router.put("/:id/items", verifyAccess, completeQuotationValidator, allValidator, completeQuotationController);
router.post("/:id/payments", verifyAccess, createQuotationPaymentValidator, allValidator, createQuotationPaymentController);
router.post("/:id/expenses", verifyAccess, createQuotationExpenseValidator, allValidator, createQuotationExpenseController);
