import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { uploadCompanyAssetController } from "../controllers/uploads.controller";

export const router: Router = Router();

router.post("/company-asset", verifyAccess, uploadCompanyAssetController);
