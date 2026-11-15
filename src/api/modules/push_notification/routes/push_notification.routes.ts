import { Router } from "express";
import { verifyAccess } from "../../../../middlewares/user-access";
import { allValidator } from "../../../../middlewares/error-validator";
import { subscribeValidator, unsubscribeValidator } from "../validators/push_notification.validator";
import { getPushStatusController } from "../controllers/get_status.controller";
import { subscribePushController } from "../controllers/subscribe.controller";
import { unsubscribePushController } from "../controllers/unsubscribe.controller";
import { sendTestPushController } from "../controllers/send_test.controller";

// Notificaciones al teléfono (ver README.md). Son del propio teléfono y del
// propio usuario: autoservicio de la sesión, como cambiar la contraseña
// (verifyAccess las deja pasar por SELF_SERVICE_ROUTES).
export const router: Router = Router();

router.get("/status", verifyAccess, getPushStatusController);
router.post("/subscribe", verifyAccess, subscribeValidator, allValidator, subscribePushController);
router.post("/unsubscribe", verifyAccess, unsubscribeValidator, allValidator, unsubscribePushController);
router.post("/test", verifyAccess, sendTestPushController);
