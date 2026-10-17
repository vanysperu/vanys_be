import { Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { nowUtc, todayInBusinessTz } from "../../../../../utils/dateUtils";
import { logQuotationEvent } from "../timeline/quotation_event.service";

// Vencer una cotización es automático (según `valid_until`), no una acción
// manual de un usuario — por eso este job actualiza el estado directo en
// vez de pasar por changeQuotationStatus/ALLOWED_TRANSITIONS (ese mapa es
// solo para transiciones que un usuario puede elegir a mano). Sin actor
// (created_by null en el evento — lo hizo el sistema, no una persona).
export const expireOverdueQuotations = async (): Promise<number> => {
  // "Válida hasta el 22" = vigente TODO el 22 en Lima; vence recién cuando
  // en Lima ya es 23. Se compara contra el día calendario de Lima como
  // string YYYY-MM-DD: antes se comparaba contra un Date, que Sequelize
  // convierte con la zona del proceso — en un servidor en UTC vencía a las
  // 7 p. m. de Lima, 5 horas antes de tiempo.
  const today = todayInBusinessTz();

  const overdue = await DataBase.instance.quotation.findAll({
    attributes: ["id"],
    where: {
      status: "pending",
      valid_until: { [Op.ne]: null, [Op.lt]: today },
    },
  });

  let expired = 0;

  for (const { id } of overdue) {
    const changed = await DataBase.instance.sequelize.transaction(async (transaction) => {
      // El WHERE vuelve a exigir "pending": entre el findAll de arriba y
      // este UPDATE un usuario pudo haber aprobado/rechazado la cotización,
      // y antes el job la pisaba a "Vencida" igual (solo filtraba por id).
      const [affected] = await DataBase.instance.quotation.update(
        { status: "expired", updated_at: nowUtc() },
        { where: { id, status: "pending" }, transaction }
      );
      if (affected === 0) return false;

      await logQuotationEvent({
        quotationId: id,
        action: "status_changed",
        description: 'Estado cambiado de "Pendiente" a "Vencida" automáticamente (venció la fecha límite)',
        transaction,
      });
      return true;
    });

    if (changed) expired += 1;
  }

  return expired;
};
