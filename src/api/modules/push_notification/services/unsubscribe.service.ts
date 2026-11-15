import { DataBase } from "../../../../database";
import { nowUtc } from "../../../../utils/dateUtils";
import { IToken } from "../../../interfaces/IToken.interface";
import { endpointHash } from "./subscribe.service";

// Apaga las notificaciones de ESE teléfono (botón "Desactivar" o cerrar
// sesión). Solo la suscripción del propio usuario: nunca la de otro.
export async function unsubscribePushService(user: IToken, endpoint: string): Promise<{ active: false }> {
  await DataBase.instance.push_subscription.update(
    { active: false, updated_by: user.userId, updated_at: nowUtc() },
    { where: { endpoint_hash: endpointHash(endpoint), user_id: user.userId } }
  );
  return { active: false };
}
