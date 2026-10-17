import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import { payEmployeeDebtValidator } from "../validators/employee_debt.validator";
import { listEmployeeDebtsController, payEmployeeDebtController } from "../controllers/employee_debt.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listEmployeeDebtsController);
router.put("/pay/:userId", verifyAccess, payEmployeeDebtValidator, allValidator, payEmployeeDebtController);
