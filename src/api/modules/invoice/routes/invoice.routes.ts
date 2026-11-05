import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import { invoiceIdValidator, listInvoicesValidator } from "../validators/invoice.validator";
import { listInvoicesController } from "../controllers/list.controller";
import { uploadInvoiceFileController } from "../controllers/upload_file.controller";
import { getInvoiceFileController } from "../controllers/get_file.controller";
import { retryInvoiceDriveController } from "../controllers/retry_drive.controller";

// Facturas (módulo RBAC `invoice`, ver README.md). Las facturas se crean al
// registrar una compra o al cerrar una cotización; acá se listan, se les sube
// el archivo y se reintenta su copia a Drive.
export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, listInvoicesValidator, allValidator, listInvoicesController);
router.post("/:id/file", verifyAccess, invoiceIdValidator, allValidator, uploadInvoiceFileController);
router.get("/:id/file", verifyAccess, invoiceIdValidator, allValidator, getInvoiceFileController);
router.put("/:id/drive-retry", verifyAccess, invoiceIdValidator, allValidator, retryInvoiceDriveController);
