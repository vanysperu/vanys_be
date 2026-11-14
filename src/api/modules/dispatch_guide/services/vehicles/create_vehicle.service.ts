import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import type { VehicleDto, VehicleInput } from "../../types/dispatch_guide.types";
import { cleanVehicleInput, rethrowVehicleDuplicate, toVehicleDto } from "./vehicle_shared";

// La empresa ya viene resuelta por el controller (la del usuario, o la que
// eligió el Super Administrador).
export const createVehicleService = async (companyId: number, input: VehicleInput, actorId: number): Promise<VehicleDto> => {
  const now = nowUtc();
  try {
    const vehicle = await DataBase.instance.transport_vehicle.create({
      id: 0,
      company_id: companyId,
      ...cleanVehicleInput(input),
      active: true,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    });
    return toVehicleDto(vehicle);
  } catch (error: unknown) {
    return rethrowVehicleDuplicate(error);
  }
};
