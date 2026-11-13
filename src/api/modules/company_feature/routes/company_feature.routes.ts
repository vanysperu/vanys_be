import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { requireSystemRole } from "../../../../middlewares/require-system-role";
import { allValidator } from "../../../../middlewares/error-validator";
import { getCompanyFeaturesValidator, setCompanyFeaturesValidator } from "../validators/company_feature.validator";
import { getCompanyFeaturesController } from "../controllers/get_features.controller";
import { setCompanyFeaturesController } from "../controllers/set_features.controller";

export const router: Router = Router();

// Qué tiene contratado cada empresa: acción de plataforma (CLAUDE.md §10).
router.get("/:companyId", verifyAccess, requireSystemRole, getCompanyFeaturesValidator, allValidator, getCompanyFeaturesController);
router.put("/:companyId", verifyAccess, requireSystemRole, setCompanyFeaturesValidator, allValidator, setCompanyFeaturesController);
