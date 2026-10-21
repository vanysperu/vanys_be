import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { overviewValidator } from "../validators/statistics.validator";
import { statisticsOverviewController } from "../controllers/overview.controller";

export const router: Router = Router();

router.get("/overview", verifyAccess, overviewValidator, allValidator, statisticsOverviewController);
