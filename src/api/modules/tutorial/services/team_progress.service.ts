import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../database";
import { buildPaginationMeta, getOffset, PaginatedResult } from "../../../../core/utils/paginate";
import { utcToBusinessParts } from "../../../../utils/dateUtils";
import { TeamMemberProgressDto } from "../types/tutorial.types";

interface TeamRow {
  user_id: number;
  full_name: string;
  email: string;
  role_name: string | null;
  completed_lessons: string | null;
  last_activity: Date | string | null;
}

// Personas activas de la empresa (nunca las de práctica), cada una con las
// lecciones que completó. Paginado (CLAUDE.md §4).
const TEAM_FROM_SQL = `
  FROM \`user\` u
  LEFT JOIN business_unit bu ON bu.id = u.business_unit_id
  WHERE COALESCE(bu.company_id, u.company_id) = :companyId
    AND u.practice_of_user_id IS NULL
    AND u.is_deleted = false
    AND u.status = true`;

const TEAM_SQL = `
  SELECT u.id AS user_id,
         CONCAT_WS(' ', u.name, u.paternal_lastname) AS full_name,
         u.email,
         (SELECT GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ')
            FROM user_role ur INNER JOIN role r ON r.id = ur.role_id
           WHERE ur.user_id = u.id) AS role_name,
         (SELECT GROUP_CONCAT(tp.lesson_code ORDER BY tp.lesson_code)
            FROM tutorial_progress tp
           WHERE tp.user_id = u.id AND tp.status = 'completed') AS completed_lessons,
         (SELECT MAX(tp.updated_at) FROM tutorial_progress tp WHERE tp.user_id = u.id) AS last_activity
  ${TEAM_FROM_SQL}
  ORDER BY last_activity IS NULL, last_activity DESC, u.id ASC
  LIMIT :limit OFFSET :offset`;

// GET /tutorial/team-progress: quién aprendió qué (solo administradores).
export const teamProgressService = async ({
  companyId,
  page,
  limit,
}: {
  companyId: number;
  page: number;
  limit: number;
}): Promise<PaginatedResult<TeamMemberProgressDto>> => {
  const [countRows, rows] = await Promise.all([
    DataBase.instance.sequelize.query<{ total: number }>(`SELECT COUNT(*) AS total ${TEAM_FROM_SQL}`, {
      replacements: { companyId },
      type: QueryTypes.SELECT,
    }),
    DataBase.instance.sequelize.query<TeamRow>(TEAM_SQL, {
      replacements: { companyId, limit, offset: getOffset(page, limit) },
      type: QueryTypes.SELECT,
    }),
  ]);

  const data = rows.map((row) => ({
    user_id: Number(row.user_id),
    full_name: row.full_name,
    email: row.email,
    role_name: row.role_name,
    completed_lessons: row.completed_lessons ? row.completed_lessons.split(",") : [],
    last_activity: row.last_activity ? utcToBusinessParts(row.last_activity) : null,
  }));
  return { data, meta: buildPaginationMeta(Number(countRows[0]?.total ?? 0), page, limit) };
};
