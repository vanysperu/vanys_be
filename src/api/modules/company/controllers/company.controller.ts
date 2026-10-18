import { buildBusinessDateRange, resolveIsDeletedFilter } from "../../../../core/utils/listFilters";
import { Op, WhereOptions } from "sequelize";
import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createCompany } from "../services/create/company.service";
import { updateCompanyById } from "../services/update/company.service";
import { getCompaniesList, getCompanyById } from "../services/find/company.service";
import { disableOrEnableCompanyById } from "../services/delete/company.service";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { CompanyAttributes } from "../model/company.model";

// Filtros por columna de la pantalla "Empresas": texto -> LIKE, el resto
// (ninguno acá, no hay enums/booleanos filtrables en esta tabla todavía).
const buildCompanyListWhere = (query: Record<string, unknown>): WhereOptions<CompanyAttributes> => {
  const where: WhereOptions<CompanyAttributes> = {};
  if (typeof query.businessName === "string" && query.businessName.trim()) {
    where.business_name = { [Op.like]: `%${query.businessName.trim()}%` };
  }
  if (typeof query.ruc === "string" && query.ruc.trim()) {
    where.ruc = { [Op.like]: `%${query.ruc.trim()}%` };
  }
  if (typeof query.email === "string" && query.email.trim()) {
    where.email = { [Op.like]: `%${query.email.trim()}%` };
  }
  const isDeleted = resolveIsDeletedFilter(query.status);
  if (isDeleted !== undefined) where.is_deleted = isDeleted;
  const createdAt = buildBusinessDateRange(query.dateFrom, query.dateTo);
  if (createdAt) where.created_at = createdAt;
  return where;
};

export const createCompanyController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const company = await createCompany({ company: req.body, createdBy: user.userId });

  ok(res, 201, company, "Empresa creada correctamente");
});

export const updateCompanyController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  const result = await updateCompanyById({ company: req.body, companyId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Empresa actualizada correctamente");
});

export const listCompaniesController = asyncHandler(async (req: Request, res: Response) => {
  const { page, limit, orderBy, orderDir } = parsePaginationParams(req.query);
  const where = buildCompanyListWhere(req.query as Record<string, unknown>);

  const resp = await getCompaniesList({ page, limit, orderBy, orderDir, where });
  const message = resp.data.length === 0 ? "No se encontraron empresas" : "Lista de empresas obtenida correctamente";

  ok(res, 200, resp, message);
});

// Esta pareja ("mi empresa") es aparte de create/update/list/disable
// (esos siguen exclusivos de is_system, ver CLAUDE.md sección 10 — dar de
// alta o gestionar OTRAS empresas es acción de plataforma). Acá un admin
// de empresa gestiona la información de branding de la SUYA propia para
// que salga bien en sus PDFs de cotización — nunca puede leer ni tocar la
// de otra empresa porque el id no viene del cliente, sale del token.
export const getMyCompanyDocumentSettingsController = asyncHandler(async (req: Request, res: Response) => {
  const { companyId, isSystem } = req.user as IToken;
  if (isSystem || !companyId) {
    throw new AppError(400, "Esta acción es solo para usuarios de una empresa");
  }

  const company = await getCompanyById(companyId);
  ok(res, 200, company, "Configuración obtenida correctamente");
});

export const updateMyCompanyDocumentSettingsController = asyncHandler(async (req: Request, res: Response) => {
  const { userId, companyId, isSystem } = req.user as IToken;
  if (isSystem || !companyId) {
    throw new AppError(400, "Esta acción es solo para usuarios de una empresa");
  }

  // Whitelist explícito: nunca pasar req.body completo a updateCompanyById
  // acá — ese service no filtra columnas, y un admin de empresa no debe
  // poder tocar `ruc`, `theme_color` ni `is_deleted` de su propia fila por
  // esta vía (esos siguen exclusivos de is_system).
  // legal_terms_caption se reutiliza como el texto libre de "términos y
  // condiciones" que se imprime debajo de cada cotización — un solo
  // lugar donde cargarlo, se aplica a todas las cotizaciones de la
  // empresa (pedido explícito del usuario).
  const { business_name, address, phone, logo_url, legal_terms_caption } = req.body;
  const result = await updateCompanyById({
    company: { business_name, address, phone, logo_url, legal_terms_caption },
    companyId,
    updatedBy: userId,
  });
  ok(res, 200, result, "Configuración actualizada correctamente");
});

export const disableCompanyController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  const result = await disableOrEnableCompanyById({ companyId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Proceso exitoso");
});
