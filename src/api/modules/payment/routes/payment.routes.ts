import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import { disablePaymentValidator, updatePaymentValidator } from "../validators/payment.validator";
import { disablePaymentController, listPaymentsController, updatePaymentController } from "../controllers/payment.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listPaymentsController);
router.put("/update/:id", verifyAccess, updatePaymentValidator, allValidator, updatePaymentController);
router.put("/disable/:id", verifyAccess, disablePaymentValidator, allValidator, disablePaymentController);
