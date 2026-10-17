import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { getRoleResourceTreeValidator, setRoleResourcesValidator } from "../validators/roles_resources.validator";
import { getRoleResourceTreeController, setRoleResourcesController } from "../controllers/roles_resources.controller";

export const router: Router = Router();

router.get("/roles/:roleId/resources", verifyAccess, getRoleResourceTreeValidator, allValidator, getRoleResourceTreeController);
router.put("/roles/:roleId/resources", verifyAccess, setRoleResourcesValidator, allValidator, setRoleResourcesController);
