import { Transaction, UniqueConstraintError } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { utcToBusinessParts } from "../../../../../utils/dateUtils";
import type { TransportDriverModel } from "../../model/dispatch_guide.models";
import type { DriverDto, DriverInput } from "../../types/dispatch_guide.types";
import { belongsToCaller } from "../shared/guide_company";

export const toDriverDto = (driver: TransportDriverModel): DriverDto => ({
  id: Number(driver.id),
  company_id: Number(driver.company_id),
  doc_type: driver.doc_type,
  doc_number: driver.doc_number,
  first_names: driver.first_names,
  last_names: driver.last_names,
  license_number: driver.license_number,
  active: Boolean(driver.active),
  createdAt: utcToBusinessParts(driver.created_at),
});

// Documento y licencia se guardan en mayúsculas y sin espacios (ej. la
// licencia "Q12345678").
export const cleanDriverInput = (input: DriverInput) => ({
  doc_type: input.doc_type,
  doc_number: input.doc_number.toUpperCase().replace(/\s/g, ""),
  first_names: input.first_names.trim(),
  last_names: input.last_names.trim(),
  license_number: input.license_number.toUpperCase().replace(/\s/g, ""),
});

export const rethrowDriverDuplicate = (error: unknown): never => {
  if (error instanceof UniqueConstraintError) {
    throw new AppError(409, "Ya hay un conductor con ese documento", undefined, "DRIVER_DUPLICATE");
  }
  throw error;
};

// Conductor de la empresa del usuario; uno de otra empresa responde 404.
export const findDriverForCaller = async (id: number, user: IToken, transaction?: Transaction): Promise<TransportDriverModel> => {
  const driver = await DataBase.instance.transport_driver.findByPk(id, { transaction });
  if (!driver || !belongsToCaller(user, driver)) throw new AppError(404, "El conductor no existe");
  return driver;
};
