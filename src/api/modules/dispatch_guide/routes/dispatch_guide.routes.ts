import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { requireCompanyFeature } from "../../../../middlewares/require-company-feature";
import { paginationValidator } from "../../../validators/pagination.validator";
import {
  carriersValidator,
  catalogListValidator,
  driverValidator,
  guideValidator,
  idValidator,
  listGuidesValidator,
  prefillValidator,
  registerGuideValidator,
  updateDriverValidator,
  updateGuideValidator,
  updateVehicleValidator,
  vehicleValidator,
  voidGuideValidator,
} from "../validators/dispatch_guide.validator";
import { guideFileUpload } from "../controllers/guide_file_upload";
import { listGuidesController } from "../controllers/list_guides.controller";
import { getGuideController } from "../controllers/get_guide.controller";
import { createGuideController } from "../controllers/create_guide.controller";
import { updateGuideController } from "../controllers/update_guide.controller";
import { registerGuideController } from "../controllers/register_guide.controller";
import { uploadGuidePdfController } from "../controllers/upload_guide_pdf.controller";
import { getGuidePdfController } from "../controllers/get_guide_pdf.controller";
import { discardGuideController } from "../controllers/discard_guide.controller";
import { voidGuideController } from "../controllers/void_guide.controller";
import { prefillGuideController } from "../controllers/prefill_guide.controller";
import { listCarriersController } from "../controllers/list_carriers.controller";
import { listVehiclesController } from "../controllers/list_vehicles.controller";
import { createVehicleController } from "../controllers/create_vehicle.controller";
import { updateVehicleController } from "../controllers/update_vehicle.controller";
import { toggleVehicleController } from "../controllers/toggle_vehicle.controller";
import { listDriversController } from "../controllers/list_drivers.controller";
import { createDriverController } from "../controllers/create_driver.controller";
import { updateDriverController } from "../controllers/update_driver.controller";
import { toggleDriverController } from "../controllers/toggle_driver.controller";

// Guías de remisión (módulo RBAC `dispatch_guide`, ver README.md). Modo manual:
// nada se envía a SUNAT. Todo el módulo exige la funcionalidad de la empresa.
export const router: Router = Router();
const guard = [verifyAccess, requireCompanyFeature("dispatch_guide")];

// Guías.
router.get("/guides", ...guard, paginationValidator, listGuidesValidator, allValidator, listGuidesController);
router.get("/prefill", ...guard, prefillValidator, allValidator, prefillGuideController);
router.get("/guides/:id", ...guard, idValidator, allValidator, getGuideController);
router.post("/guides", ...guard, guideValidator, allValidator, createGuideController);
router.put("/guides/:id", ...guard, updateGuideValidator, allValidator, updateGuideController);
router.post("/guides/:id/register", ...guard, guideFileUpload, registerGuideValidator, allValidator, registerGuideController);
router.post("/guides/:id/file", ...guard, guideFileUpload, idValidator, allValidator, uploadGuidePdfController);
router.get("/guides/:id/file", ...guard, idValidator, allValidator, getGuidePdfController);
router.post("/guides/:id/discard", ...guard, idValidator, allValidator, discardGuideController);
router.post("/guides/:id/void", ...guard, voidGuideValidator, allValidator, voidGuideController);

// Transportistas (proveedores marcados como transportista), vehículos y conductores.
router.get("/carriers", ...guard, paginationValidator, carriersValidator, allValidator, listCarriersController);
router.get("/vehicles", ...guard, paginationValidator, catalogListValidator, allValidator, listVehiclesController);
router.post("/vehicles", ...guard, vehicleValidator, allValidator, createVehicleController);
router.put("/vehicles/:id", ...guard, updateVehicleValidator, allValidator, updateVehicleController);
router.put("/vehicles/:id/disable", ...guard, idValidator, allValidator, toggleVehicleController);
router.get("/drivers", ...guard, paginationValidator, catalogListValidator, allValidator, listDriversController);
router.post("/drivers", ...guard, driverValidator, allValidator, createDriverController);
router.put("/drivers/:id", ...guard, updateDriverValidator, allValidator, updateDriverController);
router.put("/drivers/:id/disable", ...guard, idValidator, allValidator, toggleDriverController);
