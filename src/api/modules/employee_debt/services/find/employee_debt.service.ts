import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";

// "¿A quién se le debe y cuánto?" (pedido explícito del usuario) — se
// agrega por trabajador, nunca se expone la lista de compras sueltas acá
// (eso ya se ve en el detalle de la orden de compra que generó cada deuda).
export interface EmployeeDebtSummaryItem {
  user_id: number;
  employee_name: string;
  pending_amount: number;
  pending_count: number;
  // Lo ya repuesto, para el filtro "Pagadas" (antes solo existían las
  // pendientes y no había forma de consultar qué se le devolvió a quién).
  paid_amount: number;
  paid_count: number;
  last_paid_at: string | null;
}

// "pending" (por defecto, pedido explícito del usuario) = trabajadores con
// algo pendiente de reponer; "paid" = con reposiciones ya hechas; "all" = todos.
export type EmployeeDebtStatusFilter = "pending" | "paid" | "all";

export interface EmployeeDebtSummaryFilter {
  companyId: number | null;
  status: EmployeeDebtStatusFilter;
  // Trabajador puntual.
  userId?: number;
  // Rango sobre la fecha de la compra que generó cada deuda.
  dateFrom?: string;
  dateTo?: string;
  page: number;
  limit: number;
}

interface RawSummaryRow {
  user_id: number;
  employee_name: string;
  pending_amount: string | null;
  pending_count: string | null;
  paid_amount: string | null;
  paid_count: string | null;
  last_paid_at: string | null;
}

const STATUS_HAVING: Record<EmployeeDebtStatusFilter, string> = {
  pending: "HAVING pending_count > 0",
  paid: "HAVING paid_count > 0",
  all: "",
};

const getEmployeeDebtSummary = async (
  filter: EmployeeDebtSummaryFilter
): Promise<PaginatedResult<EmployeeDebtSummaryItem>> => {
  // El rango de fechas se compara en la zona de Lima (las fechas se guardan
  // en UTC): sin el CONVERT_TZ, una compra hecha a las 8 p. m. del 17 caería
  // en el día 18.
  const grouped = `
    SELECT ed.user_id,
           CONCAT(u.name, ' ', u.paternal_lastname) AS employee_name,
           SUM(CASE WHEN ed.status = 'pending' THEN ed.amount ELSE 0 END) AS pending_amount,
           SUM(CASE WHEN ed.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
           SUM(CASE WHEN ed.status = 'paid' THEN ed.amount ELSE 0 END) AS paid_amount,
           SUM(CASE WHEN ed.status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
           MAX(ed.paid_at) AS last_paid_at
    FROM employee_debt ed
    INNER JOIN user u ON u.id = ed.user_id
    WHERE (:companyId IS NULL OR ed.company_id = :companyId)
      AND (:userId IS NULL OR ed.user_id = :userId)
      AND (:dateFrom IS NULL OR DATE(CONVERT_TZ(ed.created_at, '+00:00', '-05:00')) >= :dateFrom)
      AND (:dateTo IS NULL OR DATE(CONVERT_TZ(ed.created_at, '+00:00', '-05:00')) <= :dateTo)
    GROUP BY ed.user_id, u.name, u.paternal_lastname
    ${STATUS_HAVING[filter.status]}
  `;

  const replacements = {
    companyId: filter.companyId,
    userId: filter.userId ?? null,
    dateFrom: filter.dateFrom ?? null,
    dateTo: filter.dateTo ?? null,
  };

  const [countRow] = (await DataBase.instance.sequelize.query(`SELECT COUNT(*) AS total FROM (${grouped}) t`, {
    type: QueryTypes.SELECT,
    replacements,
  })) as { total: number }[];

  // Pendientes: lo que más se debe arriba. Pagadas: lo más reciente arriba.
  const orderBy = filter.status === "paid" ? "last_paid_at DESC, paid_amount DESC" : "pending_amount DESC, paid_amount DESC";

  const rows = (await DataBase.instance.sequelize.query(
    `${grouped} ORDER BY ${orderBy} LIMIT :limit OFFSET :offset`,
    {
      type: QueryTypes.SELECT,
      replacements: { ...replacements, limit: filter.limit, offset: (filter.page - 1) * filter.limit },
    }
  )) as RawSummaryRow[];

  const data: EmployeeDebtSummaryItem[] = rows.map((row) => ({
    user_id: row.user_id,
    employee_name: row.employee_name,
    pending_amount: Number(row.pending_amount ?? 0),
    pending_count: Number(row.pending_count ?? 0),
    paid_amount: Number(row.paid_amount ?? 0),
    paid_count: Number(row.paid_count ?? 0),
    last_paid_at: row.last_paid_at,
  }));

  return { data, meta: buildPaginationMeta(Number(countRow?.total ?? 0), filter.page, filter.limit) };
};

export { getEmployeeDebtSummary };
