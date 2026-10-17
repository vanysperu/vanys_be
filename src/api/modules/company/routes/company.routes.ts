import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { requireSystemRole } from "../../../../middlewares/require-system-role";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  createCompanyValidator,
  disableCompanyValidator,
  updateCompanyValidator,
  updateMyCompanyDocumentSettingsValidator,
} from "../validators/company.validator";
import {
  createCompanyController,
  disableCompanyController,
  getMyCompanyDocumentSettingsController,
  listCompaniesController,
  updateCompanyController,
  updateMyCompanyDocumentSettingsController,
} from "../controllers/company.controller";

export const router: Router = Router();

// Dar de alta una empresa = dar de alta un tenant nuevo: acción de plataforma.
router.get("/list", verifyAccess, requireSystemRole, paginationValidator, allValidator, listCompaniesController);
router.post("/create", verifyAccess, requireSystemRole, createCompanyValidator, allValidator, createCompanyController);
router.put("/update/:id", verifyAccess, requireSystemRole, updateCompanyValidator, allValidator, updateCompanyController);
router.put("/disable/:id", verifyAccess, requireSystemRole, disableCompanyValidator, allValidator, disableCompanyController);

// "Mi empresa": un admin de empresa (no is_system) gestiona el branding de
// SU propia empresa para el PDF de cotización — sin requireSystemRole,
// company_id sale del token, nunca del cliente.
router.get("/my-document-settings", verifyAccess, getMyCompanyDocumentSettingsController);
router.put(
  "/my-document-settings",
  verifyAccess,
  updateMyCompanyDocumentSettingsValidator,
  allValidator,
  updateMyCompanyDocumentSettingsController
);
