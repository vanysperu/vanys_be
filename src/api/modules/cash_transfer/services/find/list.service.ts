import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../../core/utils/paginate";
import { CashTransferItem, CashTransferListFilter } from "../../types/cash_transfer.types";
import { toTransferItem, TRANSFER_SELECT_SQL, TransferRow } from "../shared/transfer_shared";

// Mismo alcance que Caja: empresa de la sesión (null = Super Administrador sin
// empresa elegida) y tienda según el alcance de LECTURA del usuario.
const SCOPE_SQL = `t.is_deleted = false
  AND (:companyId IS NULL OR t.company_id = :companyId)
  AND (:businessUnitId IS NULL OR t.business_unit_id = :businessUnitId)
  AND (:dateFrom IS NULL OR t.occurred_at >= :dateFrom)
  AND (:dateTo IS NULL OR t.occurred_at <= :dateTo)`;

/**
 * Transferencias vigentes, paginadas en SQL (LIMIT/OFFSET, nunca todo a
 * memoria). Orden por fecha y, a igual fecha, por alta (índice
 * idx_cash_transfer_company_date). Caja ya las muestra mezcladas con el resto
 * del dinero; este listado es el propio del recurso.
 */
export async function listCashTransfersService(filter: CashTransferListFilter): Promise<PaginatedResult<CashTransferItem>> {
  const replacements = {
    companyId: filter.companyId,
    businessUnitId: filter.businessUnitId ?? null,
    dateFrom: filter.dateFrom ?? null,
    dateTo: filter.dateTo ?? null,
    limit: filter.limit,
    offset: (filter.page - 1) * filter.limit,
  };
  // La dirección es una de dos constantes del código, nunca un valor del usuario.
  const direction = filter.orderDir === "asc" ? "ASC" : "DESC";

  const [rows, [countRow]] = await Promise.all([
    DataBase.instance.sequelize.query<TransferRow>(
      `${TRANSFER_SELECT_SQL}
       WHERE ${SCOPE_SQL}
       ORDER BY t.occurred_at ${direction}, t.created_at ${direction}, t.id ${direction}
       LIMIT :limit OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements }
    ),
    DataBase.instance.sequelize.query<{ total: number | string }>(
      `SELECT COUNT(*) AS total FROM cash_transfer t WHERE ${SCOPE_SQL}`,
      { type: QueryTypes.SELECT, replacements }
    ),
  ]);

  return {
    data: rows.map(toTransferItem),
    meta: buildPaginationMeta(Number(countRow?.total ?? 0), filter.page, filter.limit),
  };
}
