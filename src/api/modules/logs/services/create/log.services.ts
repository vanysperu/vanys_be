import { Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { LogAttributes } from "../../model/log.model";

// Servicio para crear un log (uso interno).
// Acepta una `transaction` opcional para que el log pueda ser parte de la
// misma operación atómica que la acción que registra — si la acción se
// revierte, su log tampoco queda (ej. anular un movimiento de caja: ver
// cash_movement/services/delete).
export async function createLogService(
  data: Omit<LogAttributes, "id" | "created_at">,
  transaction?: Transaction
) {
  try {
    const log = await DataBase.instance.log.create({ ...data }, { transaction });
    return log;
  } catch (error) {
    console.error("Error en createLogService:", error);
    throw error;
  }
}
