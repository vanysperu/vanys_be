import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import { createCashMovementValidator, disableCashMovementValidator } from "../validators/cash_movement.validator";
import {
  createCashMovementController,
  disableCashMovementController,
  listCashMovementsController,
} from "../controllers/cash_movement.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listCashMovementsController);
router.post("/create", verifyAccess, createCashMovementValidator, allValidator, createCashMovementController);
router.put("/disable/:id", verifyAccess, disableCashMovementValidator, allValidator, disableCashMovementController);
