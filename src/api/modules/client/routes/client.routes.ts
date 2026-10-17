import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import { createClientValidator, disableClientValidator, updateClientValidator } from "../validators/client.validator";
import {
  createClientController,
  disableClientController,
  listClientsController,
  updateClientController,
} from "../controllers/client.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, paginationValidator, allValidator, listClientsController);
router.post("/create", verifyAccess, createClientValidator, allValidator, createClientController);
router.put("/update/:id", verifyAccess, updateClientValidator, allValidator, updateClientController);
router.put("/disable/:id", verifyAccess, disableClientValidator, allValidator, disableClientController);
