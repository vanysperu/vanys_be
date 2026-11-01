import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  cancelManualEmployeeDebtValidator,
  createManualEmployeeDebtValidator,
  employeeDebtDetailValidator,
  payEmployeeDebtValidator,
  voidEmployeeDebtPaymentValidator,
} from "../validators/employee_debt.validator";
import {
  cancelManualEmployeeDebtController,
  createManualEmployeeDebtController,
  getEmployeeDebtDetailController,
  listEmployeeDebtPaymentsController,
  listEmployeeDebtsController,
  payEmployeeDebtController,
  voidEmployeeDebtPaymentController,
} from "../controllers/employee_debt.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listEmployeeDebtsController);
router.get(
  "/detail",
  verifyAccess,
  paginationValidator,
  employeeDebtDetailValidator,
  allValidator,
  getEmployeeDebtDetailController
);
router.post("/create", verifyAccess, createManualEmployeeDebtValidator, allValidator, createManualEmployeeDebtController);
router.put(
  "/disable/:id",
  verifyAccess,
  cancelManualEmployeeDebtValidator,
  allValidator,
  cancelManualEmployeeDebtController
);
router.put("/pay/:userId", verifyAccess, payEmployeeDebtValidator, allValidator, payEmployeeDebtController);
router.get("/payments", verifyAccess, paginationValidator, allValidator, listEmployeeDebtPaymentsController);
router.put(
  "/payment/disable/:id",
  verifyAccess,
  voidEmployeeDebtPaymentValidator,
  allValidator,
  voidEmployeeDebtPaymentController
);
