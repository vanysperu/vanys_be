import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { updateAdvertisementService } from "../services/update.service";
import { advertisementActorOf } from "./actor";

// PUT /advertisement/update/:id — zona, título, enlace, imagen y/o posición.
export const updateAdvertisementController = asyncHandler(async (req: Request, res: Response) => {
  const advertisement = await updateAdvertisementService(
    Number(req.params.id),
    {
      zone_id: req.body.zone_id,
      title: req.body.title,
      link_url: req.body.link_url,
      image_path: req.body.image_path,
      position: req.body.position,
    },
    advertisementActorOf(req.user as IToken)
  );

  ok(res, 200, advertisement, "Anuncio actualizado correctamente");
});
