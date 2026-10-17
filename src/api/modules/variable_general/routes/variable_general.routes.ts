import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import {
  createVariableGeneralValidator,
  idValidator,
  paginationAndFilterValidator,
  updateVariableGeneralValidator,
} from "../validators/variable_general.validator";
import {
  createVariableGeneralController,
  deleteVariableGeneralController,
  disableVariableGeneralController,
  getVariableGeneralByIdController,
  listVariableGeneralController,
  updateVariableGeneralController,
} from "../controllers/variable_general.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationAndFilterValidator, allValidator, listVariableGeneralController);

router.get("/detail/:id", verifyAccess, idValidator, allValidator, getVariableGeneralByIdController);

router.post("/create", verifyAccess, createVariableGeneralValidator, allValidator, createVariableGeneralController);

router.put("/update/:id", verifyAccess, idValidator, updateVariableGeneralValidator, allValidator, updateVariableGeneralController);

router.delete("/delete/:id", verifyAccess, idValidator, allValidator, deleteVariableGeneralController);
router.put("/disable/:id", verifyAccess, idValidator, allValidator, disableVariableGeneralController);


