import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  cancelManualEmployeeDebtValidator,
  correctEmployeeDebtPaymentValidator,
  correctManualEmployeeDebtValidator,
  createManualEmployeeDebtValidator,
  employeeDebtCorrectionsValidator,
  employeeDebtDetailValidator,
  findEmployeeDebtValidator,
  payEmployeeDebtValidator,
  voidEmployeeDebtPaymentValidator,
} from "../validators/employee_debt.validator";
import {
  cancelManualEmployeeDebtController,
  correctEmployeeDebtPaymentController,
  correctManualEmployeeDebtController,
  createManualEmployeeDebtController,
  findEmployeeDebtController,
  findEmployeeDebtPaymentController,
  getEmployeeDebtDetailController,
  listEmployeeDebtCorrectionsController,
  listEmployeeDebtPaymentCorrectionsController,
  listEmployeeDebtPaymentsController,
  listEmployeeDebtsController,
  payEmployeeDebtController,
  voidEmployeeDebtPaymentController,
} from "../controllers/employee_debt.controller";

export const router: Router = Router();

// Rutas fijas primero; las de forma "/:id/corrections" al final, para que
// ninguna tape a otra con la misma cantidad de segmentos.
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
router.get("/find/:id", verifyAccess, findEmployeeDebtValidator, allValidator, findEmployeeDebtController);
router.put("/update/:id", verifyAccess, correctManualEmployeeDebtValidator, allValidator, correctManualEmployeeDebtController);
router.put(
  "/disable/:id",
  verifyAccess,
  cancelManualEmployeeDebtValidator,
  allValidator,
  cancelManualEmployeeDebtController
);
router.put("/pay/:userId", verifyAccess, payEmployeeDebtValidator, allValidator, payEmployeeDebtController);
router.get("/payments", verifyAccess, paginationValidator, allValidator, listEmployeeDebtPaymentsController);
router.get("/payment/find/:id", verifyAccess, findEmployeeDebtValidator, allValidator, findEmployeeDebtPaymentController);
router.put(
  "/payment/update/:id",
  verifyAccess,
  correctEmployeeDebtPaymentValidator,
  allValidator,
  correctEmployeeDebtPaymentController
);
router.put(
  "/payment/disable/:id",
  verifyAccess,
  voidEmployeeDebtPaymentValidator,
  allValidator,
  voidEmployeeDebtPaymentController
);
router.get(
  "/payment/:id/corrections",
  verifyAccess,
  employeeDebtCorrectionsValidator,
  allValidator,
  listEmployeeDebtPaymentCorrectionsController
);
router.get(
  "/:id/corrections",
  verifyAccess,
  employeeDebtCorrectionsValidator,
  allValidator,
  listEmployeeDebtCorrectionsController
);
