import { DataBase } from "../../../../../database";
import { nowUtc } from "../../../../../utils/dateUtils";
import { CashMovementAttributes } from "../../model/cash_movement.model";

export type CreateCashMovementDto = Omit<
  CashMovementAttributes,
  "id" | "is_deleted" | "created_by" | "created_at" | "updated_by" | "updated_at"
>;

const createCashMovement = async ({
  movement,
  createdBy,
}: {
  movement: CreateCashMovementDto;
  createdBy?: number;
}) => {
  return DataBase.instance.cash_movement.create({
    id: 0,
    ...movement,
    is_deleted: false,
    created_by: createdBy ?? null,
    created_at: nowUtc(),
    updated_by: null,
    updated_at: null,
  });
};

export { createCashMovement };
