import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import type { VehicleDto, VehicleInput } from "../../types/dispatch_guide.types";
import { cleanVehicleInput, findVehicleForCaller, rethrowVehicleDuplicate, toVehicleDto } from "./vehicle_shared";

// Editar no cambia las guías ya armadas: cada guía guarda su propia copia de
// la placa.
export const updateVehicleService = async (id: number, input: VehicleInput, user: IToken): Promise<VehicleDto> => {
  const vehicle = await findVehicleForCaller(id, user);
  try {
    await vehicle.update({ ...cleanVehicleInput(input), updated_by: user.userId, updated_at: nowUtc() });
    return toVehicleDto(vehicle);
  } catch (error: unknown) {
    return rethrowVehicleDuplicate(error);
  }
};
