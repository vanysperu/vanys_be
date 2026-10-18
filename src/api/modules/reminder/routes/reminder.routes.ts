import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import {
  createReminderValidator,
  listRemindersValidator,
  recipientsValidator,
  reminderIdValidator,
  updateReminderValidator,
} from "../validators/reminder.validator";
import { createReminderController } from "../controllers/create.controller";
import { updateReminderController } from "../controllers/update.controller";
import { toggleReminderController } from "../controllers/disable.controller";
import { markReminderReadController } from "../controllers/read.controller";
import { listRemindersController } from "../controllers/list.controller";
import { dueRemindersController } from "../controllers/due.controller";
import { listReminderRecipientsController } from "../controllers/recipients.controller";

export const router: Router = Router();

router.get("/list", verifyAccess, listRemindersValidator, allValidator, listRemindersController);
router.get("/due", verifyAccess, dueRemindersController);
router.get("/recipients", verifyAccess, recipientsValidator, allValidator, listReminderRecipientsController);
router.post("/create", verifyAccess, createReminderValidator, allValidator, createReminderController);
router.put("/update/:id", verifyAccess, updateReminderValidator, allValidator, updateReminderController);
router.put("/disable/:id", verifyAccess, reminderIdValidator, allValidator, toggleReminderController);
router.put("/read/:id", verifyAccess, reminderIdValidator, allValidator, markReminderReadController);
