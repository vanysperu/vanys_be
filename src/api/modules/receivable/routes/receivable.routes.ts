import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { listReceivablesValidator } from "../validators/receivable.validator";
import { listReceivablesController } from "../controllers/list.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, listReceivablesValidator, allValidator, listReceivablesController);
