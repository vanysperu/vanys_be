import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import {
  createCashTransferValidator,
  disableCashTransferValidator,
  listCashTransfersValidator,
  updateCashTransferValidator,
} from "../validators/cash_transfer.validator";
import { createCashTransferController } from "../controllers/create.controller";
import { updateCashTransferController } from "../controllers/update.controller";
import { disableCashTransferController } from "../controllers/disable.controller";
import { listCashTransfersController } from "../controllers/list.controller";

// Montado en /cash-movement/transfer (las transferencias son parte de Caja).
// Todas las rutas pasan por verifyAccess: el rol necesita el resource de esa
// ruta + verbo (seeder 20261110100100-seed-cash-transfer-resources.js).
export const router: Router = Router();

router.get("/list", verifyAccess, listCashTransfersValidator, allValidator, listCashTransfersController);
router.post("/create", verifyAccess, createCashTransferValidator, allValidator, createCashTransferController);
router.put("/update/:id", verifyAccess, updateCashTransferValidator, allValidator, updateCashTransferController);
router.put("/disable/:id", verifyAccess, disableCashTransferValidator, allValidator, disableCashTransferController);
