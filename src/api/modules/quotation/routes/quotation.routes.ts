import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { requireSystemRole } from "../../../../middlewares/require-system-role";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  changeItemStageValidator,
  itemExclusionValidator,
  changeStatusValidator,
  forceStatusValidator,
  mockupIdValidator,
  completeQuotationValidator,
  quotationBoardValidator,
  createQuotationExpenseValidator,
  createQuotationPaymentValidator,
  correctQuotationExpenseValidator,
  createQuotationValidator,
  getQuotationValidator,
  resetQuotationValidator,
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
import { setItemExclusionController } from "../controllers/item_exclusion.controller";
import { forceQuotationStatusController } from "../controllers/force_status.controller";
import { exportQuotationsController } from "../controllers/export.controller";
import { listMockupsController } from "../controllers/mockup/list_mockups.controller";
import { uploadMockupController } from "../controllers/mockup/upload_mockup.controller";
import { getMockupFileController } from "../controllers/mockup/get_mockup_file.controller";
import { disableMockupController } from "../controllers/mockup/disable_mockup.controller";
import { quotationBoardController } from "../controllers/board.controller";
import { getQuotationProfitController } from "../controllers/profit.controller";
import { quotationResetPreviewController } from "../controllers/reset_preview.controller";
import { resetQuotationController } from "../controllers/reset.controller";
import {
  getPublicLinkController,
  logWhatsappShareController,
  regeneratePublicLinkController,
  sendQuotationEmailController,
  setPublicLinkEnabledController,
} from "../controllers/share/share.controllers";
import {
  logWhatsappShareValidator,
  quotationShareIdValidator,
  sendQuotationEmailValidator,
  setPublicLinkEnabledValidator,
} from "../validators/share.validator";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listQuotationsController);
// Reporte en Excel con los mismos filtros del listado (21-nov).
router.get("/export", verifyAccess, allValidator, exportQuotationsController);
router.get("/board", verifyAccess, quotationBoardValidator, allValidator, quotationBoardController);
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
// Compartir con el cliente (Sprint 2, ítem 7): enlace público, interruptor,
// enlace nuevo, WhatsApp y correo. La vista pública está en public_quotation.routes.ts.
router.get("/:id/public-link", verifyAccess, quotationShareIdValidator, allValidator, getPublicLinkController);
router.put("/:id/public-link", verifyAccess, setPublicLinkEnabledValidator, allValidator, setPublicLinkEnabledController);
router.post("/:id/public-link/regenerate", verifyAccess, quotationShareIdValidator, allValidator, regeneratePublicLinkController);
router.post("/:id/share/whatsapp", verifyAccess, logWhatsappShareValidator, allValidator, logWhatsappShareController);
router.post("/:id/share/email", verifyAccess, sendQuotationEmailValidator, allValidator, sendQuotationEmailController);
// Ganancia (pagos, IGV, gastos, compras y neto). Solo en el sistema, no en el PDF.
router.get("/:id/profit", verifyAccess, getQuotationValidator, allValidator, getQuotationProfitController);
// Resetear a Pendiente borrando lo que generó: solo Super Administrador.
router.get("/:id/reset-preview", verifyAccess, requireSystemRole, getQuotationValidator, allValidator, quotationResetPreviewController);
router.put("/:id/reset", verifyAccess, requireSystemRole, resetQuotationValidator, allValidator, resetQuotationController);
router.post("/create", verifyAccess, createQuotationValidator, allValidator, createQuotationController);
router.put("/update/:id", verifyAccess, updateQuotationValidator, allValidator, updateQuotationController);
router.put("/status/:id", verifyAccess, changeStatusValidator, allValidator, changeQuotationStatusController);
// Cambio de estado a mano (cualquier estado): solo administradores (21-nov).
router.put("/force-status/:id", verifyAccess, forceStatusValidator, allValidator, forceQuotationStatusController);
// Mockups (diseños) de la cotización, solo para el equipo (21-nov).
router.get("/:id/mockups", verifyAccess, getQuotationValidator, allValidator, listMockupsController);
router.post("/:id/mockups", verifyAccess, getQuotationValidator, allValidator, uploadMockupController);
router.get("/mockup/:mockupId/file", verifyAccess, mockupIdValidator, allValidator, getMockupFileController);
router.patch("/mockup/:mockupId/disable", verifyAccess, mockupIdValidator, allValidator, disableMockupController);
router.put("/item/:itemId/stage", verifyAccess, changeItemStageValidator, allValidator, changeItemStageController);
// Producto no aceptado por el cliente (o reactivado), sin editar la cotización.
router.put("/item/:itemId/excluded", verifyAccess, itemExclusionValidator, allValidator, setItemExclusionController);
// Completar una cotización "Pendiente de cotizar" (llegó desde la web).
router.put("/:id/items", verifyAccess, completeQuotationValidator, allValidator, completeQuotationController);
router.post("/:id/payments", verifyAccess, createQuotationPaymentValidator, allValidator, createQuotationPaymentController);
router.post("/:id/expenses", verifyAccess, createQuotationExpenseValidator, allValidator, createQuotationExpenseController);
