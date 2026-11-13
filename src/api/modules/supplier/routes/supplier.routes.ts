import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  createSupplierValidator,
  disableSupplierValidator,
  listSuppliersValidator,
  updateSupplierValidator,
} from "../validators/supplier.validator";
import { createSupplierController } from "../controllers/create.controller";
import { updateSupplierController } from "../controllers/update.controller";
import { listSuppliersController } from "../controllers/list.controller";
import { disableSupplierController } from "../controllers/disable.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, listSuppliersValidator, allValidator, listSuppliersController);
router.post("/create", verifyAccess, createSupplierValidator, allValidator, createSupplierController);
router.put("/update/:id", verifyAccess, updateSupplierValidator, allValidator, updateSupplierController);
router.put("/disable/:id", verifyAccess, disableSupplierValidator, allValidator, disableSupplierController);
