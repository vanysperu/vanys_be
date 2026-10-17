import { Request, Response } from "express";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { getActiveThemesList } from "../services/find/theme.service";

export const listThemesController = asyncHandler(async (req: Request, res: Response) => {
  const themes = await getActiveThemesList();

  ok(res, 200, themes, "Paletas obtenidas correctamente");
});
