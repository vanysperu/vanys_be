import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { paginationValidator } from "../../../validators/pagination.validator";
import { prepareLessonValidator, saveProgressValidator, teamProgressValidator } from "../validators/tutorial.validator";
import { startPracticeController } from "../controllers/start_practice.controller";
import { resetPracticeController } from "../controllers/reset_practice.controller";
import { prepareLessonController } from "../controllers/prepare_lesson.controller";
import { listProgressController } from "../controllers/list_progress.controller";
import { saveProgressController } from "../controllers/save_progress.controller";
import { teamProgressController } from "../controllers/team_progress.controller";

// Modo enseñanza (21-nov). Cada ruta pasa por verifyAccess (RBAC del módulo
// "tutorial", seeder 20261121100800).
export const router: Router = Router();

router.post("/practice/start", verifyAccess, startPracticeController);
router.post("/practice/reset", verifyAccess, resetPracticeController);
router.post("/practice/prepare", verifyAccess, prepareLessonValidator, allValidator, prepareLessonController);
router.get("/progress", verifyAccess, listProgressController);
router.put("/progress/:code", verifyAccess, saveProgressValidator, allValidator, saveProgressController);
router.get("/team-progress", verifyAccess, paginationValidator, teamProgressValidator, allValidator, teamProgressController);
