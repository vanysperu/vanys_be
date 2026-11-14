import { nowUtc } from "../../../../../utils/dateUtils";
import { IToken } from "../../../../interfaces/IToken.interface";
import type { DriverDto, DriverInput } from "../../types/dispatch_guide.types";
import { cleanDriverInput, findDriverForCaller, rethrowDriverDuplicate, toDriverDto } from "./driver_shared";

// Editar no cambia las guías ya armadas: cada guía guarda su propia copia de
// los datos del conductor.
export const updateDriverService = async (id: number, input: DriverInput, user: IToken): Promise<DriverDto> => {
  const driver = await findDriverForCaller(id, user);
  try {
    await driver.update({ ...cleanDriverInput(input), updated_by: user.userId, updated_at: nowUtc() });
    return toDriverDto(driver);
  } catch (error: unknown) {
    return rethrowDriverDuplicate(error);
  }
};
