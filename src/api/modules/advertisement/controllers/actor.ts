import { IToken } from "../../../interfaces/IToken.interface";
import { AdvertisementActor } from "../types/advertisement.types";

// Quién hace la acción, desde la sesión (nunca desde el body).
export const advertisementActorOf = (user: IToken): AdvertisementActor => ({
  userId: user.userId,
  isSystem: user.isSystem,
  companyId: user.companyId,
});
