import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import type { DriverDto, DriverInput } from "../../types/dispatch_guide.types";
import { cleanDriverInput, rethrowDriverDuplicate, toDriverDto } from "./driver_shared";

// La empresa ya viene resuelta por el controller.
export const createDriverService = async (companyId: number, input: DriverInput, actorId: number): Promise<DriverDto> => {
  const now = nowUtc();
  try {
    const driver = await DataBase.instance.transport_driver.create({
      id: 0,
      company_id: companyId,
      ...cleanDriverInput(input),
      active: true,
      created_by: actorId,
      created_at: now,
      updated_by: actorId,
      updated_at: now,
    });
    return toDriverDto(driver);
  } catch (error: unknown) {
    return rethrowDriverDuplicate(error);
  }
};
