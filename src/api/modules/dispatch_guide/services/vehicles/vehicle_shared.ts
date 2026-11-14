import { Transaction, UniqueConstraintError } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { IToken } from "../../../../interfaces/IToken.interface";
import { utcToBusinessParts } from "../../../../../utils/dateUtils";
import type { TransportVehicleModel } from "../../model/dispatch_guide.models";
import type { VehicleDto, VehicleInput } from "../../types/dispatch_guide.types";
import { belongsToCaller, blankToNull } from "../shared/guide_company";

export const toVehicleDto = (vehicle: TransportVehicleModel): VehicleDto => ({
  id: Number(vehicle.id),
  company_id: Number(vehicle.company_id),
  plate: vehicle.plate,
  description: vehicle.description,
  authorization_number: vehicle.authorization_number,
  active: Boolean(vehicle.active),
  createdAt: utcToBusinessParts(vehicle.created_at),
});

// La placa se guarda en mayúsculas y sin guiones ni espacios (así la pide
// SUNAT): "abc-123" y "ABC123" son el mismo vehículo.
export const normalizePlate = (plate: string): string => plate.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const cleanVehicleInput = (input: VehicleInput) => ({
  plate: normalizePlate(input.plate),
  description: blankToNull(input.description),
  authorization_number: blankToNull(input.authorization_number),
});

export const rethrowVehicleDuplicate = (error: unknown): never => {
  if (error instanceof UniqueConstraintError) {
    throw new AppError(409, "Ya hay un vehículo con esa placa", undefined, "VEHICLE_DUPLICATE");
  }
  throw error;
};

// Vehículo de la empresa del usuario; uno de otra empresa responde 404.
export const findVehicleForCaller = async (id: number, user: IToken, transaction?: Transaction): Promise<TransportVehicleModel> => {
  const vehicle = await DataBase.instance.transport_vehicle.findByPk(id, { transaction });
  if (!vehicle || !belongsToCaller(user, vehicle)) throw new AppError(404, "El vehículo no existe");
  return vehicle;
};
