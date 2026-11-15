import { AppError } from "../../../../core/errors/AppError";
import { IToken } from "../../../interfaces/IToken.interface";
import { readPushConfig } from "./shared/push_config";
import { PushSendResult, sendPushToUsers } from "./shared/send_push";

// "Probar notificación": le llega al propio usuario en todos sus teléfonos
// activados. Sirve para confirmar que el permiso y la app instalada funcionan.
export async function sendTestPushService(user: IToken): Promise<PushSendResult> {
  if (!readPushConfig()) throw new AppError(409, "Las notificaciones al teléfono no están configuradas en el servidor", undefined, "PUSH_DISABLED");
  const result = await sendPushToUsers([user.userId], {
    title: "Notificaciones activadas",
    body: "Así te avisaremos cuando llegue un pedido para cotizar.",
    url: "/cotizaciones",
    tag: "push-test",
  });
  if (result.attempted === 0) throw new AppError(404, "Este usuario no tiene notificaciones activadas en ningún teléfono", undefined, "PUSH_NOT_SUBSCRIBED");
  return result;
}
