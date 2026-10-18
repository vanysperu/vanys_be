import { buildBusinessDateRange, resolveIsDeletedFilter } from "../../../../core/utils/listFilters";
import { Op, WhereOptions } from "sequelize";
import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createBusinessUnit } from "../services/create/business_unit.service";
import { updateBusinessUnitById } from "../services/update/business_unit.service";
import { getBusinessUnitById, getBusinessUnitsList } from "../services/find/business_unit.service";
import { disableOrEnableBusinessUnitById } from "../services/delete/business_unit.service";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { BusinessUnitAttributes } from "../models/business_unit.models";

// Filtros por columna de "Tiendas": texto -> LIKE.
const buildBusinessUnitListWhere = (query: Record<string, unknown>): WhereOptions<BusinessUnitAttributes> => {
  const where: WhereOptions<BusinessUnitAttributes> = {};
  if (typeof query.businessCode === "string" && query.businessCode.trim()) {
    where.business_code = { [Op.like]: `%${query.businessCode.trim()}%` };
  }
  if (typeof query.address === "string" && query.address.trim()) {
    where.address = { [Op.like]: `%${query.address.trim()}%` };
  }
  const isDeleted = resolveIsDeletedFilter(query.status);
  if (isDeleted !== undefined) where.is_deleted = isDeleted;
  const createdAt = buildBusinessDateRange(query.dateFrom, query.dateTo);
  if (createdAt) where.created_at = createdAt;
  return where;
};

export const createBusinessUnitController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  // Un admin de empresa (no is_system) solo puede crear tiendas de SU
  // propia empresa — nunca confiar en el company_id que manda el body
  // (CLAUDE.md sección 10). Un is_system sí puede elegir cualquier empresa.
  if (!user.isSystem && Number(req.body.company_id) !== user.companyId) {
    throw new AppError(403, "No puedes crear tiendas para otra empresa");
  }

  const businessUnit = await createBusinessUnit({ businessUnit: req.body, createdBy: user.userId });

  ok(res, 201, businessUnit, "Tienda creada correctamente");
});

export const updateBusinessUnitController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertBusinessUnitBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a esta tienda");
  }

  const result = await updateBusinessUnitById({
    businessUnit: req.body,
    businessUnitId: Number(id),
    updatedBy: user.userId,
  });

  ok(res, 200, result, "Tienda actualizada correctamente");
});

export const listBusinessUnitsController = asyncHandler(async (req: Request, res: Response) => {
  const { isSystem, companyId } = req.user as IToken;
  const { page, limit, orderBy, orderDir } = parsePaginationParams(req.query);
  const where = buildBusinessUnitListWhere(req.query as Record<string, unknown>);

  // Un is_system puede filtrar por una empresa puntual (ej. el selector de
  // "Tienda" al crear un usuario, una vez elegida la empresa) — un caller
  // normal NUNCA puede usar este query param para ver otra empresa, siempre
  // queda forzado a la suya (mismo criterio que el resto del sistema).
  const requestedCompanyId = Number(req.query.companyId) || undefined;
  const resolvedCompanyId = isSystem ? (requestedCompanyId ?? null) : companyId;

  const resp = await getBusinessUnitsList({
    page,
    limit,
    orderBy,
    orderDir,
    companyId: resolvedCompanyId,
    where,
  });
  const message = resp.data.length === 0 ? "No se encontraron tiendas" : "Lista de tiendas obtenida correctamente";

  ok(res, 200, resp, message);
});

export const disableBusinessUnitController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertBusinessUnitBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a esta tienda");
  }

  const result = await disableOrEnableBusinessUnitById({ businessUnitId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Proceso exitoso");
});

// Evita que el admin de la Empresa A edite/deshabilite una tienda de la
// Empresa B adivinando su id — un usuario is_system no tiene esta
// restricción (mismo patrón que roles_resources.controller.ts).
const assertBusinessUnitBelongsToCaller = async (businessUnitId: number, user: IToken): Promise<boolean> => {
  if (user.isSystem) return true;

  const businessUnit = await getBusinessUnitById(businessUnitId);
  if (!businessUnit) return false;

  return businessUnit.company_id === user.companyId;
};
