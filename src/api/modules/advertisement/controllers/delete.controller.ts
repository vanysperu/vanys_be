import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { deleteAdvertisementService } from "../services/delete.service";
import { advertisementActorOf } from "./actor";

// DELETE /advertisement/delete/:id — borrado DEFINITIVO, con su imagen.
export const deleteAdvertisementController = asyncHandler(async (req: Request, res: Response) => {
  const deleted = await deleteAdvertisementService(Number(req.params.id), advertisementActorOf(req.user as IToken));
  ok(res, 200, deleted, "Anuncio eliminado definitivamente, junto con su imagen");
});
