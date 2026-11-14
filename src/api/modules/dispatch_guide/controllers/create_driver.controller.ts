import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { resolveCompanyForGuides } from "../services/shared/guide_company";
import { createDriverService } from "../services/drivers/create_driver.service";
import type { DriverInput } from "../types/dispatch_guide.types";

// POST /api/dispatch-guide/drivers
export const createDriverController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const companyId = await resolveCompanyForGuides(user, req.body.company_id, "conductores");
  ok(res, 201, await createDriverService(companyId, req.body as DriverInput, user.userId), "Conductor creado");
});
