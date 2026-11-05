import { col, fn, Op } from "sequelize";
import { DataBase } from "../../../../../database";
import { AppError } from "../../../../../core/errors/AppError";
import { utcToBusinessParts } from "../../../../../utils/dateUtils";
import { AdvertisementModel } from "../../model/advertisement.model";
import { AdvertisementDto } from "../../types/advertisement.types";

interface ZoneTotalRow {
  company_id: number | string;
  zone_id: number | string | null;
  total: number | string;
}

const zoneKey = (companyId: number | string, zoneId: number | string | null) => `${Number(companyId)}:${zoneId ?? "none"}`;

// Lo que ve el panel. Empresas, zonas y cantidad por zona salen de UNA
// consulta cada una (sin N+1).
export async function toAdvertisementDtos(rows: AdvertisementModel[]): Promise<AdvertisementDto[]> {
  const companyIds = [...new Set(rows.map((row) => Number(row.company_id)))];
  if (companyIds.length === 0) return [];
  const zoneIds = [...new Set(rows.flatMap((row) => (row.zone_id ? [Number(row.zone_id)] : [])))];

  const [companies, zones, totals] = await Promise.all([
    DataBase.instance.company.findAll({
      where: { id: { [Op.in]: companyIds } },
      attributes: ["id", "business_name"],
    }),
    zoneIds.length === 0
      ? Promise.resolve([])
      : DataBase.instance.variable_general.findAll({
          where: { id: { [Op.in]: zoneIds } },
          attributes: ["id", "prefix_id", "name", "is_deleted"],
        }),
    DataBase.instance.advertisement.findAll({
      where: { company_id: { [Op.in]: companyIds } },
      attributes: ["company_id", "zone_id", [fn("COUNT", col("id")), "total"]],
      group: ["company_id", "zone_id"],
      raw: true,
    }) as unknown as Promise<ZoneTotalRow[]>,
  ]);
  const nameById = new Map(companies.map((company) => [Number(company.id), company.business_name]));
  const zoneById = new Map(
    zones.map((zone) => [Number(zone.id), { id: Number(zone.id), code: zone.prefix_id, name: zone.name, is_active: !zone.is_deleted }])
  );
  const totalByZone = new Map(totals.map((row) => [zoneKey(row.company_id, row.zone_id), Number(row.total)]));

  return rows.map((row) => ({
    id: Number(row.id),
    company_id: Number(row.company_id),
    company_name: nameById.get(Number(row.company_id)) ?? null,
    zone: row.zone_id ? zoneById.get(Number(row.zone_id)) ?? null : null,
    title: row.title,
    link_url: row.link_url,
    image_path: row.image_path,
    position: Number(row.position),
    zone_total: totalByZone.get(zoneKey(row.company_id, row.zone_id)) ?? 0,
    is_active: Boolean(row.is_active),
    created_at: utcToBusinessParts(row.created_at),
    updated_at: row.updated_at ? utcToBusinessParts(row.updated_at) : null,
  }));
}

export async function toAdvertisementDto(row: AdvertisementModel): Promise<AdvertisementDto> {
  const [dto] = await toAdvertisementDtos([row]);
  if (!dto) throw new AppError(404, "El anuncio no existe", undefined, "ADVERTISEMENT_NOT_FOUND");
  return dto;
}

// Vuelve a leer el anuncio ya guardado (después del commit).
export async function loadAdvertisementDto(id: number): Promise<AdvertisementDto> {
  const row = await DataBase.instance.advertisement.findByPk(id);
  if (!row) throw new AppError(404, "El anuncio no existe", undefined, "ADVERTISEMENT_NOT_FOUND");
  return toAdvertisementDto(row);
}
