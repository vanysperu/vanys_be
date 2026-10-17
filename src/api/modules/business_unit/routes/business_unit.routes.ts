import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  createBusinessUnitValidator,
  disableBusinessUnitValidator,
  updateBusinessUnitValidator,
} from "../validators/business_unit.validator";
import {
  createBusinessUnitController,
  disableBusinessUnitController,
  listBusinessUnitsController,
  updateBusinessUnitController,
} from "../controllers/business_unit.controller";

export const router: Router = Router();

// A diferencia de "company" (dar de alta una empresa/tenant SÍ es acción de
// plataforma), una tienda es un recurso de la propia empresa: un admin de
// empresa (no is_system) puede crear/editar/deshabilitar las tiendas de SU
// empresa — el controller valida la pertenencia, no requireSystemRole acá.
router.get("/list", verifyAccess, paginationValidator, allValidator, listBusinessUnitsController);
router.post("/create", verifyAccess, createBusinessUnitValidator, allValidator, createBusinessUnitController);
router.put("/update/:id", verifyAccess, updateBusinessUnitValidator, allValidator, updateBusinessUnitController);
router.put("/disable/:id", verifyAccess, disableBusinessUnitValidator, allValidator, disableBusinessUnitController);
