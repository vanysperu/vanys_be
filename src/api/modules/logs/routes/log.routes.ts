import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import { getLogsController } from "../controllers/log.controller";
import { queryParamsDtoValidator } from "../validators/log.validator";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, queryParamsDtoValidator, allValidator, getLogsController);
