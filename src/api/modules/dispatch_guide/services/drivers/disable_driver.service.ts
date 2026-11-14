import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import type { DriverDto } from "../../types/dispatch_guide.types";
import { findDriverForCaller, toDriverDto } from "./driver_shared";

// Deshabilitar / habilitar (soft-delete, CLAUDE.md §1): un conductor
// deshabilitado deja de ofrecerse al armar una guía.
export const toggleDriverStatusService = async (id: number, user: IToken): Promise<DriverDto> => {
  const driver = await findDriverForCaller(id, user);
  await driver.update({ active: !driver.active, updated_by: user.userId, updated_at: nowUtc() });
  return toDriverDto(driver);
};
