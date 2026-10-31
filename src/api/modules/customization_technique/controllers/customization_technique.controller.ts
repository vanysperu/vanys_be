import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { AppError } from "../../../../core/errors/AppError";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { createTechnique } from "../services/create/customization_technique.service";
import { updateTechniqueById } from "../services/update/customization_technique.service";
import { getTechniqueById, getTechniquesList } from "../services/find/customization_technique.service";
import { disableOrEnableTechniqueById } from "../services/delete/customization_technique.service";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { resolveListCompanyFilter, resolveTargetCompanyId } from "../../../../core/rbac/companyScope";

export const createTechniqueController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;

  // Misma regla que productos (ver product.controller.ts): una técnica de
  // personalización pertenece a una empresa específica — el Super
  // Administrador la elige en el formulario.
  const company_id = await resolveTargetCompanyId(user, req.body.company_id, "técnicas");

  const technique = await createTechnique({ technique: { ...req.body, company_id }, createdBy: user.userId });

  ok(res, 201, technique, "Técnica creada correctamente");
});

export const updateTechniqueController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertTechniqueBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a esta técnica");
  }

  const result = await updateTechniqueById({ technique: req.body, techniqueId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Técnica actualizada correctamente");
});

export const listTechniquesController = asyncHandler(async (req: Request, res: Response) => {
  const { isSystem, companyId } = req.user as IToken;
  const { page, limit, orderBy, orderDir } = parsePaginationParams(req.query);
  // Filtros por columna (nombre, estado) — no había buscador global acá.
  const name = (req.query.name as string) || undefined;
  const status = (req.query.status as string) || undefined;

  const resp = await getTechniquesList({
    page,
    limit,
    orderBy,
    orderDir,
    companyId: resolveListCompanyFilter(req.user as IToken, req.query.companyId),
    name,
    status,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
  });
  const message = resp.data.length === 0 ? "No se encontraron técnicas" : "Lista de técnicas obtenida correctamente";

  ok(res, 200, resp, message);
});

export const disableTechniqueController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { id } = req.params;

  if (!(await assertTechniqueBelongsToCaller(Number(id), user))) {
    throw new AppError(403, "No tienes acceso a esta técnica");
  }

  const result = await disableOrEnableTechniqueById({ techniqueId: Number(id), updatedBy: user.userId });

  ok(res, 200, result, "Proceso exitoso");
});

const assertTechniqueBelongsToCaller = async (techniqueId: number, user: IToken): Promise<boolean> => {
  if (user.isSystem) return true;

  const technique = await getTechniqueById(techniqueId);
  if (!technique) return false;

  return technique.company_id === user.companyId;
};
