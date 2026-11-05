import { QueryTypes } from "sequelize";
import { DataBase } from "../../../../database";
import { buildPaginationMeta, PaginatedResult } from "../../../../core/utils/paginate";
import { PublicAdvertisementDto } from "../types/advertisement.types";

export interface PublicAdvertisementsFilter {
  companyId: number;
  // Código de la zona (lo que la web pone en su página, ej. "inicio").
  zoneCode?: string;
  // O el id de la zona.
  zoneId?: number;
  page: number;
  limit: number;
  // "https://dominio" para armar la URL absoluta de la imagen.
  baseUrl: string;
}

interface PublicAdvertisementRow {
  id: number;
  title: string;
  link_url: string | null;
  image_path: string;
  position: number;
  zone_id: number | null;
  zone_code: string | null;
  zone_name: string | null;
}

// Condiciones fijas (texto de este archivo, nunca del usuario); los valores van
// bindeados. Solo anuncios PRENDIDOS de la empresa de la key, y nunca los de
// una zona deshabilitada: deshabilitar la zona la apaga entera en la web.
const WHERE = `
  WHERE a.company_id = :companyId
    AND a.is_active = true
    AND (a.zone_id IS NULL OR z.is_deleted = false)
    AND (:zoneCode IS NULL OR z.prefix_id = :zoneCode)
    AND (:zoneId IS NULL OR a.zone_id = :zoneId)`;

/**
 * Anuncios que muestra la web, en su orden. Con zona (pedido explícito del
 * usuario: "que el endpoint mande solo la publicidad que corresponde a esa
 * zona") trae solo esa zona; sin zona, todas, agrupadas por zona (las sin
 * zona al final). El código se compara sin distinguir mayúsculas (colación
 * de MySQL).
 */
export async function listPublicAdvertisementsService(
  filter: PublicAdvertisementsFilter
): Promise<PaginatedResult<PublicAdvertisementDto>> {
  const replacements = {
    companyId: filter.companyId,
    zoneCode: filter.zoneCode ?? null,
    zoneId: filter.zoneId ?? null,
    limit: filter.limit,
    offset: (filter.page - 1) * filter.limit,
  };
  const from = "FROM advertisement a LEFT JOIN general_variable z ON z.id = a.zone_id";

  const [countRow] = (await DataBase.instance.sequelize.query(`SELECT COUNT(*) AS total ${from} ${WHERE}`, {
    type: QueryTypes.SELECT,
    replacements,
  })) as { total: number | string }[];

  const rows = (await DataBase.instance.sequelize.query(
    `SELECT a.id, a.title, a.link_url, a.image_path, a.position,
            a.zone_id, z.prefix_id AS zone_code, z.name AS zone_name
     ${from} ${WHERE}
     ORDER BY a.zone_id IS NULL, a.zone_id, a.position, a.id
     LIMIT :limit OFFSET :offset`,
    { type: QueryTypes.SELECT, replacements }
  )) as PublicAdvertisementRow[];

  return {
    data: rows.map((row) => ({
      id: Number(row.id),
      title: row.title,
      link_url: row.link_url,
      image_url: `${filter.baseUrl}${row.image_path}`,
      zone: row.zone_id === null ? null : { id: Number(row.zone_id), code: row.zone_code ?? "", name: row.zone_name ?? "" },
      position: Number(row.position),
    })),
    meta: buildPaginationMeta(Number(countRow?.total ?? 0), filter.page, filter.limit),
  };
}
