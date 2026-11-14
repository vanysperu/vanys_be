import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import type { VehicleDto } from "../../types/dispatch_guide.types";
import { findVehicleForCaller, toVehicleDto } from "./vehicle_shared";

// Deshabilitar / habilitar (soft-delete, CLAUDE.md §1): un vehículo
// deshabilitado deja de ofrecerse al armar una guía.
export const toggleVehicleStatusService = async (id: number, user: IToken): Promise<VehicleDto> => {
  const vehicle = await findVehicleForCaller(id, user);
  await vehicle.update({ active: !vehicle.active, updated_by: user.userId, updated_at: nowUtc() });
  return toVehicleDto(vehicle);
};
