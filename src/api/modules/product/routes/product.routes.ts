import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import { createProductValidator, disableProductValidator, updateProductValidator } from "../validators/product.validator";
import {
  createProductController,
  disableProductController,
  listProductsController,
  updateProductController,
} from "../controllers/product.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listProductsController);
router.post("/create", verifyAccess, createProductValidator, allValidator, createProductController);
router.put("/update/:id", verifyAccess, updateProductValidator, allValidator, updateProductController);
router.put("/disable/:id", verifyAccess, disableProductValidator, allValidator, disableProductController);
