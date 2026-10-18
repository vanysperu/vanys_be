import { QueryTypes, Transaction } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { ReminderDto } from "../../types/reminder.types";
import { REMINDER_SELECT, ReminderRow, toReminderDto } from "../shared/reminder_mapper";

// Devuelve el recordatorio ya armado (con nombres y fechas de Lima) — lo usan
// crear/editar/cancelar/marcar visto para responder la fila actualizada.
export async function getReminderDtoById(id: number, transaction?: Transaction): Promise<ReminderDto> {
  const [row] = (await DataBase.instance.sequelize.query(`${REMINDER_SELECT} WHERE rm.id = :id`, {
    type: QueryTypes.SELECT,
    replacements: { id },
    transaction,
  })) as ReminderRow[];
  if (!row) throw new AppError(404, "El recordatorio no existe");
  return toReminderDto(row);
}
