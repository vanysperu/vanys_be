import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  invoiceIdValidator,
  linkPurchasesValidator,
  listInvoicesValidator,
  pendingPurchasesValidator,
  purchaseCandidatesValidator,
  removeInvoicePurchaseValidator,
  updateInvoiceDetailsValidator,
} from "../validators/invoice.validator";
import { listInvoicesController } from "../controllers/list.controller";
import { listPurchaseCandidatesController } from "../controllers/purchase_candidates.controller";
import { uploadInvoiceFileController } from "../controllers/upload_file.controller";
import { getInvoiceFileController } from "../controllers/get_file.controller";
import { retryInvoiceDriveController } from "../controllers/retry_drive.controller";
import { listPendingPurchasesController } from "../controllers/pending_purchases.controller";
import { linkPurchasesController } from "../controllers/link_purchases.controller";
import { removeInvoicePurchaseController } from "../controllers/remove_purchase.controller";
import { updateInvoiceDetailsController } from "../controllers/update_details.controller";
import { optionalInvoiceFile } from "../controllers/optional_file";

// Facturas (módulo RBAC `invoice`, ver README.md). Las facturas se crean al
// registrar una compra o al cerrar una cotización; acá se listan, se les sube
// el archivo y se reintenta su copia a Drive.
export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, listInvoicesValidator, allValidator, listInvoicesController);
// Facturas de compra a las que se puede sumar una compra nueva (una factura
// puede cubrir varios productos).
router.get("/purchase-candidates", verifyAccess, purchaseCandidatesValidator, allValidator, listPurchaseCandidatesController);
// Compras sin factura (Sprint 2, ítem 3): bandeja, registrar/vincular una
// factura para varias compras (con su archivo en el mismo paso), quitar una
// compra de una factura y completar sus datos.
router.get("/pending-purchases", verifyAccess, paginationValidator, pendingPurchasesValidator, allValidator, listPendingPurchasesController);
router.post("/link-purchases", verifyAccess, optionalInvoiceFile, linkPurchasesValidator, allValidator, linkPurchasesController);
router.put("/:id/remove-purchase", verifyAccess, removeInvoicePurchaseValidator, allValidator, removeInvoicePurchaseController);
router.put("/:id/details", verifyAccess, updateInvoiceDetailsValidator, allValidator, updateInvoiceDetailsController);
router.post("/:id/file", verifyAccess, invoiceIdValidator, allValidator, uploadInvoiceFileController);
router.get("/:id/file", verifyAccess, invoiceIdValidator, allValidator, getInvoiceFileController);
router.put("/:id/drive-retry", verifyAccess, invoiceIdValidator, allValidator, retryInvoiceDriveController);
