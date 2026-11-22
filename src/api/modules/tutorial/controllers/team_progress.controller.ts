import { Request, Response } from "express";
import { IToken } from "../../../interfaces/IToken.interface";
import { asyncHandler } from "../../../../core/utils/asyncHandler";
import { ok } from "../../../../core/utils/response";
import { parsePaginationParams } from "../../../../core/validators/pagination.validator";
import { buildPaginationMeta } from "../../../../core/utils/paginate";
import { resolveListCompanyFilter } from "../../../../core/rbac/companyScope";
import { resolvePracticeOwner } from "../services/shared/practice_owner.service";
import { teamProgressService } from "../services/team_progress.service";

// GET /api/tutorial/team-progress?page&limit(&companyId para el Super Administrador)
// La empresa sale de la sesión: la real de la persona, aunque mire desde la práctica.
export const teamProgressController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user as IToken;
  const { page, limit } = parsePaginationParams(req.query);
  const companyId = user.isSystem ? resolveListCompanyFilter(user, req.query.companyId) : (await resolvePracticeOwner(user)).realCompanyId;
  if (!companyId) {
    ok(res, 200, { data: [], meta: buildPaginationMeta(0, page, limit) }, "Elige una empresa");
    return;
  }
  const result = await teamProgressService({ companyId, page, limit });
  ok(res, 200, result, "Avance del equipo obtenido correctamente");
});
