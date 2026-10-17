import { DataBase } from "../../../../../database";
import { Op, WhereOptions } from "sequelize";
import { LogAttributes } from "../../model/log.model";

export async function getLogsService({
  userId,
  all,
  byUserId,
  page,
  limit,
  startDate,
  endDate,
  companyId,
}: {
  userId: number;
  all: boolean;
  byUserId?: number | null;
  page: number;
  limit: number;
  startDate: string; // formato "YYYY-MM-DD"
  endDate: string;   // formato "YYYY-MM-DD"
  companyId?: number | null; // null = usuario is_system, ve logs de todas las empresas
}) {
  try {
    // Armamos el filtro dinámico
    const where: WhereOptions<LogAttributes> = {};

    // 🔹 Aislamiento por empresa
    if (companyId !== null && companyId !== undefined) {
      where.company_id = companyId;
    }

    // 🔹 Usuarios
    if (!all) {
      if (byUserId) {
        where.user_id = byUserId;
      } else {
        where.user_id = userId;
      }
    }
    // si all = true => no filtramos por usuario

    // 🔹 Fechas (incluyendo inicio y fin, sin problemas con horas)
    if (startDate && endDate) {
      // incluimos todo el día inicial y final
      const start = new Date(`${startDate}T00:00:00.000Z`);
      const end = new Date(`${endDate}T23:59:59.999Z`);

      where.created_at = {
        [Op.between]: [start, end],
      };
    }

    // 🔹 Paginación
    const offset = (page - 1) * limit;

    const logs = await DataBase.instance.log.findAll({
      where,
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });

    return logs;
  } catch (error) {
    console.error("Error en getLogsService:", error);
    throw error;
  }
}
