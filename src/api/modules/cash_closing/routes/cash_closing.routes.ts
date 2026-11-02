import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  cashClosingAdjustmentsValidator,
  cashClosingCompanyValidator,
  cashClosingPeriodValidator,
  cashCloseValidator,
  cashOpeningFindValidator,
  cashOpeningSetValidator,
  cashReopenValidator,
} from "../validators/cash_closing.validator";
import {
  cashBalancesController,
  cashClosingStatusController,
  closeCashPeriodController,
  findCashOpeningController,
  findCashPeriodController,
  listCashClosingsController,
  listPeriodAdjustmentsController,
  listPeriodEventsController,
  reopenCashPeriodController,
  setCashOpeningController,
} from "../controllers/cash_closing.controller";

// Montado en /cash-closing. Cada ruta lleva verifyAccess: el resource
// (route + verb) lo siembra 20261102100100-seed-cash-closing-module.js.
// Las rutas fijas van ANTES que /:period/... para que "status", "list", etc.
// nunca se tomen como un mes.
export const router: Router = Router();

router.get("/status", verifyAccess, cashClosingCompanyValidator, allValidator, cashClosingStatusController);
router.get("/list", verifyAccess, paginationValidator, cashClosingCompanyValidator, allValidator, listCashClosingsController);
router.get("/balances", verifyAccess, cashClosingCompanyValidator, allValidator, cashBalancesController);
router.get("/opening", verifyAccess, cashOpeningFindValidator, allValidator, findCashOpeningController);
router.put("/opening", verifyAccess, cashOpeningSetValidator, allValidator, setCashOpeningController);
router.get("/find/:period", verifyAccess, cashClosingPeriodValidator, allValidator, findCashPeriodController);
router.put("/close/:period", verifyAccess, cashCloseValidator, allValidator, closeCashPeriodController);
router.put("/reopen/:period", verifyAccess, cashReopenValidator, allValidator, reopenCashPeriodController);
router.get(
  "/:period/adjustments",
  verifyAccess,
  paginationValidator,
  cashClosingAdjustmentsValidator,
  allValidator,
  listPeriodAdjustmentsController
);
router.get(
  "/:period/events",
  verifyAccess,
  paginationValidator,
  cashClosingPeriodValidator,
  allValidator,
  listPeriodEventsController
);
