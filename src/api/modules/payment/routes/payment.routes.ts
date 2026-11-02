import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  disablePaymentValidator,
  findPaymentValidator,
  listPaymentCorrectionsValidator,
  updatePaymentValidator,
} from "../validators/payment.validator";
import {
  disablePaymentController,
  findPaymentController,
  listPaymentCorrectionsController,
  listPaymentsController,
  updatePaymentController,
} from "../controllers/payment.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listPaymentsController);
// Un pago por id (lo usa el diálogo de corrección). Va antes de /:id/corrections.
router.get("/find/:id", verifyAccess, findPaymentValidator, allValidator, findPaymentController);
router.put("/update/:id", verifyAccess, updatePaymentValidator, allValidator, updatePaymentController);
router.put("/disable/:id", verifyAccess, disablePaymentValidator, allValidator, disablePaymentController);
// Historial inmutable de correcciones de un pago.
router.get(
  "/:id/corrections",
  verifyAccess,
  listPaymentCorrectionsValidator,
  paginationValidator,
  allValidator,
  listPaymentCorrectionsController
);
