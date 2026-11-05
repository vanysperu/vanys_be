import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { moveAdvertisementService } from "../services/position.service";
import { advertisementActorOf } from "./actor";

// PUT /advertisement/position/:id — { position }: 1 = primero en la web.
export const moveAdvertisementController = asyncHandler(async (req: Request, res: Response) => {
  const advertisement = await moveAdvertisementService(
    Number(req.params.id),
    Number(req.body.position),
    advertisementActorOf(req.user as IToken)
  );

  ok(res, 200, advertisement, `Anuncio movido a la posición ${advertisement.position}`);
});
