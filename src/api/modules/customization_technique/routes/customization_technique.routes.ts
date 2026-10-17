import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  createTechniqueValidator,
  disableTechniqueValidator,
  updateTechniqueValidator,
} from "../validators/customization_technique.validator";
import {
  createTechniqueController,
  disableTechniqueController,
  listTechniquesController,
  updateTechniqueController,
} from "../controllers/customization_technique.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listTechniquesController);
router.post("/create", verifyAccess, createTechniqueValidator, allValidator, createTechniqueController);
router.put("/update/:id", verifyAccess, updateTechniqueValidator, allValidator, updateTechniqueController);
router.put("/disable/:id", verifyAccess, disableTechniqueValidator, allValidator, disableTechniqueController);
