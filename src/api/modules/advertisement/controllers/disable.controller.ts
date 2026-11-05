import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { setAdvertisementActiveService } from "../services/disable.service";
import { advertisementActorOf } from "./actor";

// PUT /advertisement/disable/:id — { is_active }: apagar (false) o prender (true).
export const disableAdvertisementController = asyncHandler(async (req: Request, res: Response) => {
  const advertisement = await setAdvertisementActiveService(
    Number(req.params.id),
    req.body.is_active === true,
    advertisementActorOf(req.user as IToken)
  );

  ok(res, 200, advertisement, advertisement.is_active ? "Anuncio prendido: ya sale en la web" : "Anuncio apagado: ya no sale en la web");
});
