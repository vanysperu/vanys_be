import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { updateStoreSettingsService } from "../services/stores/update_store.service";

// PUT /api/inventory/stores/:id
export const updateStoreController = asyncHandler(async (req: Request, res: Response) => {
  const { inventory_enabled, inventory_exit_on } = req.body as { inventory_enabled: boolean; inventory_exit_on: "delivered" | "dispatch_guide" };
  ok(res, 200, await updateStoreSettingsService(Number(req.params.id), { inventory_enabled, inventory_exit_on }, req.user as IToken), "Tienda actualizada");
});
