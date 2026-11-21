import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  createLoanPaymentValidator,
  createLoanValidator,
  listLoansValidator,
  loanIdValidator,
  loanPaymentIdValidator,
  updateLoanValidator,
} from "../validators/loan.validator";
import { listLoansController } from "../controllers/list.controller";
import { findLoanController } from "../controllers/find.controller";
import { createLoanController } from "../controllers/create.controller";
import { updateLoanController } from "../controllers/update.controller";
import { toggleLoanController } from "../controllers/disable.controller";
import { createLoanPaymentController } from "../controllers/create_payment.controller";
import { disableLoanPaymentController } from "../controllers/disable_payment.controller";

// Préstamos a personas (21-nov). Cada ruta pasa por verifyAccess (RBAC del
// módulo "loan", seeder 20261121100700).
export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, listLoansValidator, allValidator, listLoansController);
router.get("/find/:id", verifyAccess, loanIdValidator, allValidator, findLoanController);
router.post("/create", verifyAccess, createLoanValidator, allValidator, createLoanController);
router.put("/update/:id", verifyAccess, updateLoanValidator, allValidator, updateLoanController);
router.put("/disable/:id", verifyAccess, loanIdValidator, allValidator, toggleLoanController);
router.post("/:id/payment", verifyAccess, createLoanPaymentValidator, allValidator, createLoanPaymentController);
router.put("/payment/disable/:paymentId", verifyAccess, loanPaymentIdValidator, allValidator, disableLoanPaymentController);
