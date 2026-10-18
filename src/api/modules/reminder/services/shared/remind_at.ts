import { AppError } from "../../../../../core/errors/AppError";
import { businessLocalToUtc } from "../../../../../utils/dateUtils";

// Un minuto de gracia: si alguien elige "ahora mismo", el request tarda un
// poco en llegar y no debe rechazarse por eso.
const PAST_TOLERANCE_MS = 60 * 1000;

// Fecha + hora de Lima del formulario -> instante UTC. No se aceptan horas ya
// pasadas: un recordatorio para "ayer" nunca sonaría como el usuario espera.
export const resolveRemindAt = (remindDate: string, remindTime: string): Date => {
  const remindAt = businessLocalToUtc(remindDate, remindTime);
  if (Number.isNaN(remindAt.getTime())) throw new AppError(400, "La fecha u hora del recordatorio no es válida");
  if (remindAt.getTime() < Date.now() - PAST_TOLERANCE_MS) {
    throw new AppError(400, "La fecha y hora del recordatorio ya pasaron: elige un momento futuro");
  }
  return remindAt;
};
