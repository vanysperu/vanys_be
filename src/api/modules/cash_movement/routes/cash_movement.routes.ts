import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  createCashMovementValidator,
  disableCashMovementValidator,
  listCashMovementCorrectionsValidator,
  monthSummaryValidator,
  updateCashMovementValidator,
} from "../validators/cash_movement.validator";
import {
  createCashMovementController,
  disableCashMovementController,
  listCashMovementCorrectionsController,
  listCashMovementsController,
  updateCashMovementController,
} from "../controllers/cash_movement.controller";
import { monthSummaryController } from "../controllers/month_summary.controller";
import { igvBreakdownController } from "../controllers/igv_breakdown.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listCashMovementsController);
// Resultado del mes, IGV estimado y neto después del IGV.
router.get("/month-summary", verifyAccess, monthSummaryValidator, allValidator, monthSummaryController);
// Detalle del IGV del mes: qué cobros y qué compras lo forman (21-nov).
router.get("/igv-breakdown", verifyAccess, monthSummaryValidator, allValidator, igvBreakdownController);
router.post("/create", verifyAccess, createCashMovementValidator, allValidator, createCashMovementController);
router.put("/disable/:id", verifyAccess, disableCashMovementValidator, allValidator, disableCashMovementController);
// Corrección de un movimiento manual + su historial inmutable.
router.put("/update/:id", verifyAccess, updateCashMovementValidator, allValidator, updateCashMovementController);
// Historial de CUALQUIER fila de Caja (?source=): ver controller.
router.get(
  "/:sourceId/corrections",
  verifyAccess,
  listCashMovementCorrectionsValidator,
  allValidator,
  listCashMovementCorrectionsController
);
